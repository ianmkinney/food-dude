import { AppState, Platform } from 'react-native';
import { getDatabase } from '../database/operations';
import { getOwnerSessionToken } from '../platform/ownerSession';
import { getSyncEnabled } from './syncPrefs';
import { markLocalNewerForPush, pullAllIncremental, pushDirtyRecords } from './pushPull';
import { emitSyncEngineStatus } from './syncStatusBridge';
import { setLastSyncedAt } from './syncPrefs';

const PUSH_DEBOUNCE_MS = 2000;
const VISIBLE_PULL_MS = 30_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let visibleTimer: ReturnType<typeof setInterval> | null = null;
let dirtyPollTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let started = false;

async function canSync(): Promise<boolean> {
    if (!(await getSyncEnabled())) return false;
    return Boolean(await getOwnerSessionToken());
}

export function scheduleSyncPush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
        pushTimer = null;
        runSyncPush().catch(() => undefined);
    }, PUSH_DEBOUNCE_MS);
}

export async function runSyncPush(): Promise<void> {
    if (!(await canSync())) return;
    const db = getDatabase();
    try {
        emitSyncEngineStatus('syncing');
        await pushDirtyRecords(db);
        emitSyncEngineStatus('synced');
    } catch {
        emitSyncEngineStatus('error');
    }
}

export async function runFullSync(): Promise<void> {
    if (running || !(await canSync())) return;
    running = true;
    const db = getDatabase();
    try {
        emitSyncEngineStatus('syncing');
        await pullAllIncremental(db);
        await markLocalNewerForPush(db);
        await pushDirtyRecords(db);
        await pullAllIncremental(db);
        await setLastSyncedAt(Date.now());
        emitSyncEngineStatus('synced');
    } catch (e) {
        console.warn('[sync] full sync failed', e);
        emitSyncEngineStatus('error');
    } finally {
        running = false;
    }
}

export function startCloudSyncScheduler(): () => void {
    if (started) return () => {};
    started = true;

    dirtyPollTimer = setInterval(() => {
        getDatabase()
            .getFirstAsync('SELECT COUNT(*) as n FROM sync_local_meta WHERE dirty = 1')
            .then((row: { n?: number } | null) => {
                if (row?.n) scheduleSyncPush();
            })
            .catch(() => undefined);
    }, 1500);

    visibleTimer = setInterval(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        if (AppState.currentState !== 'active' && Platform.OS !== 'web') return;
        runFullSync().catch(() => undefined);
    }, VISIBLE_PULL_MS);

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') runFullSync().catch(() => undefined);
        });
    }

    const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') runFullSync().catch(() => undefined);
    });

    runFullSync().catch(() => undefined);

    const cleanup = () => {
        sub.remove();
        if (visibleTimer) clearInterval(visibleTimer);
        if (dirtyPollTimer) clearInterval(dirtyPollTimer);
        if (pushTimer) clearTimeout(pushTimer);
        visibleTimer = null;
        dirtyPollTimer = null;
        pushTimer = null;
        started = false;
    };
    return cleanup;
}

export function stopCloudSyncScheduler() {
    if (visibleTimer) clearInterval(visibleTimer);
    if (dirtyPollTimer) clearInterval(dirtyPollTimer);
    if (pushTimer) clearTimeout(pushTimer);
    visibleTimer = null;
    dirtyPollTimer = null;
    pushTimer = null;
    started = false;
    emitSyncEngineStatus('signed_out');
}
