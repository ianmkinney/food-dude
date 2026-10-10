import * as SQLite from 'expo-sqlite';
import { acquireTabLock } from './tabGuard';

// Errors from the SQLite worker arrive as plain Errors with the DOMException
// text in the message, so match on both name and message.
const OPFS_BUSY =
    /InvalidStateError|NoModificationAllowedError|invalid state|Access Handles cannot be created|modification is not allowed/i;

export const isOpfsBusyError = (error) => OPFS_BUSY.test(`${error?.name || ''} ${error?.message || ''}`);

const RETRY_DELAYS_MS = [150, 300, 600, 1200, 2400];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Open the on-device database. Safari can report the OPFS file as busy for a
 * moment after a redirect or when a closing tab hasn't let go yet, so busy
 * errors are retried with backoff. If the file still can't be opened, fall
 * back to a temporary in-memory database so the app stays usable.
 *
 * @returns {Promise<{ db: import('expo-sqlite').SQLiteDatabase, mode: 'persistent' | 'memory', error?: Error }>}
 */
export async function openAppDatabase(fileName) {
    await acquireTabLock();

    let lastError = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
            const db = await SQLite.openDatabaseAsync(fileName);
            return { db, mode: 'persistent' };
        } catch (error) {
            lastError = error;
            if (!isOpfsBusyError(error) || attempt === RETRY_DELAYS_MS.length) break;
            console.warn(`[db] ${fileName} busy (attempt ${attempt + 1}), retrying`, error?.message);
            await sleep(RETRY_DELAYS_MS[attempt]);
        }
    }

    if (!isOpfsBusyError(lastError)) throw lastError;

    try {
        const db = await SQLite.openDatabaseAsync(':memory:');
        console.warn('[db] using a temporary in-memory database:', lastError?.message);
        return { db, mode: 'memory', error: lastError };
    } catch {
        throw lastError;
    }
}
