import * as SQLite from 'expo-sqlite';
import { acquireTabLock, consumePreferMirrorAfterTakeover, requestPeersCloseDatabase } from './tabGuard';
import { closeRegisteredDatabase } from './dbRegistry';
import { loadDatabaseSnapshot } from './webDbMirror';

// Errors from the SQLite worker arrive as plain Errors with the DOMException
// text in the message, so match on both name and message.
const OPFS_BUSY =
    /InvalidStateError|NoModificationAllowedError|invalid state|Access Handles cannot be created|modification is not allowed/i;

const VFS_BROKEN = /Invalid VFS state/i;

export const isOpfsBusyError = (error) => OPFS_BUSY.test(`${error?.name || ''} ${error?.message || ''}`);

export const isInvalidVfsStateError = (error) => VFS_BROKEN.test(`${error?.name || ''} ${error?.message || ''}`);

export const isRecoverableWebDbOpenError = (error) =>
    isOpfsBusyError(error) || isInvalidVfsStateError(error) || error?.name === 'TabLockedError';

const RETRY_DELAYS_MS = [200, 400, 800, 1600, 3200, 5000];
const OPEN_ATTEMPT_TIMEOUT_MS = 4500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${label || 'open'} timed out after ${ms}ms`)), ms);
        }),
    ]);
}

async function tryOpenFromIndexedDbSnapshot() {
    const snapshot = await loadDatabaseSnapshot();
    if (!snapshot?.byteLength) return null;
    const db = await SQLite.deserializeDatabaseAsync(snapshot);
    console.warn('[db] opened from IndexedDB snapshot (OPFS unavailable in this tab)');
    return db;
}

/**
 * Open the on-device database. Safari can report the OPFS file as busy or leave
 * the shared worker in "Invalid VFS state" when many tabs contend. We ask peers
 * to close handles, retry with backoff, then fall back to an IndexedDB snapshot
 * (never deleting OPFS data).
 *
 * @returns {Promise<{ db: import('expo-sqlite').SQLiteDatabase, mode: 'persistent' | 'indexeddb' | 'memory', error?: Error }>}
 */
export async function openAppDatabase(fileName) {
    await acquireTabLock();

    const fastMirror = consumePreferMirrorAfterTakeover();
    const retryDelays = fastMirror ? [150, 300] : RETRY_DELAYS_MS;
    const openTimeout = fastMirror ? 2000 : OPEN_ATTEMPT_TIMEOUT_MS;

    let lastError = null;
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
        try {
            await closeRegisteredDatabase();
            if (attempt > 0) {
                await requestPeersCloseDatabase();
            }
            const useNewConnection = attempt > 0;
            const db = await withTimeout(
                SQLite.openDatabaseAsync(fileName, { useNewConnection }),
                openTimeout,
                'OPFS open'
            );
            return { db, mode: 'persistent' };
        } catch (error) {
            lastError = error;
            if (!isRecoverableWebDbOpenError(error) || attempt === retryDelays.length) break;
            console.warn(`[db] ${fileName} open failed (attempt ${attempt + 1}), retrying`, error?.message);
            await sleep(retryDelays[attempt]);
        }
    }

    if (lastError?.name === 'TabLockedError') {
        throw lastError;
    }

    if (isRecoverableWebDbOpenError(lastError)) {
        try {
            await requestPeersCloseDatabase(4000);
            await closeRegisteredDatabase();
            const db = await tryOpenFromIndexedDbSnapshot();
            if (db) {
                return { db, mode: 'indexeddb', error: lastError };
            }
        } catch (fallbackError) {
            console.warn('[db] IndexedDB snapshot open failed:', fallbackError?.message || fallbackError);
        }

        try {
            const db = await SQLite.openDatabaseAsync(':memory:');
            console.warn('[db] using temporary in-memory database:', lastError?.message);
            return { db, mode: 'memory', error: lastError };
        } catch {
            throw lastError;
        }
    }

    throw lastError;
}
