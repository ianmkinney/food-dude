import { AppState, Platform } from 'react-native';
import { getDatabase } from '../database/operations';
import { getOwnerSessionToken } from '../platform/ownerSession';
import { getSyncEnabled } from './syncPrefs';
import { markLocalNewerForPush, pullAllIncremental, pushDirtyRecords } from './pushPull';
import { emitSyncEngineStatus } from './syncStatusBridge';
import { setLastSyncedAt } from './syncPrefs';
import { emitSyncData } from './syncEvents';
import { patchSyncDiagnostics } from './syncDiagnostics';

const PUSH_DEBOUNCE_MS = 2000;
const DEFAULT_VISIBLE_PULL_MS = 30_000;

function visiblePullIntervalMs(): number {
    if (Platform.OS === 'web' && typeof globalThis !== 'undefined') {
        const test = (globalThis as { __AMPLIFOOD_SYNC_VISIBLE_MS__?: number }).__AMPLIFOOD_SYNC_VISIBLE_MS__;
        if (typeof test === 'number' && test >= 500) return test;
    }
    return DEFAULT_VISIBLE_PULL_MS;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let visibleTimer: ReturnType<typeof setInterval> | null = null;
let dirtyPollTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let started = false;

async function refreshDirtyCount() {
    try {
        const db = getDatabase();
        const row = (await db.getFirstAsync('SELECT COUNT(*) as n FROM sync_local_meta WHERE dirty = 1')) as {
            n?: number;
        } | null;
        patchSyncDiagnostics({ dirtyCount: Number(row?.n ?? 0) });
    } catch {
        // ignore
    }
}

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
        const pushed = await pushDirtyRecords(db);
        patchSyncDiagnostics({ lastPushAt: Date.now(), lastPushRecords: pushed, lastError: null });
        await refreshDirtyCount();
        if (pushed > 0) {
            emitSyncData({ kind: 'push', applied: pushed });
        }
        emitSyncEngineStatus('synced');
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        patchSyncDiagnostics({ lastError: msg });
        emitSyncEngineStatus('error');
    }
}

export async function runFullSync(): Promise<void> {
    if (running || !(await canSync())) return;
    running = true;
    const db = getDatabase();
    try {
        emitSyncEngineStatus('syncing');
        const pull1 = await pullAllIncremental(db);
        await markLocalNewerForPush(db);
        const pushed = await pushDirtyRecords(db);
        const pull2 = await pullAllIncremental(db);
        const applied = pull1.applied + pull2.applied;
        await setLastSyncedAt(Date.now());
        patchSyncDiagnostics({
            lastPullAt: Date.now(),
            lastPullApplied: applied,
            lastPushAt: pushed > 0 ? Date.now() : undefined,
            lastPushRecords: pushed,
            lastError: null,
        });
        await refreshDirtyCount();
        if (applied > 0) {
            const collections = [...new Set([...pull1.collections, ...pull2.collections])];
            emitSyncData({ kind: 'pull', applied, collections });
        }
        if (pushed > 0) {
            emitSyncData({ kind: 'push', applied: pushed });
        }
        emitSyncEngineStatus('synced');
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[sync] full sync failed', e);
        patchSyncDiagnostics({ lastError: msg });
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
                const n = Number(row?.n ?? 0);
                patchSyncDiagnostics({ dirtyCount: n });
                if (n) scheduleSyncPush();
            })
            .catch(() => undefined);
    }, 1500);

    const pullMs = visiblePullIntervalMs();
    visibleTimer = setInterval(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        if (AppState.currentState !== 'active' && Platform.OS !== 'web') return;
        runFullSync().catch(() => undefined);
    }, pullMs);

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') runFullSync().catch(() => undefined);
        });
    }

    const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') runFullSync().catch(() => undefined);
    });

    runFullSync().catch(() => undefined);
    refreshDirtyCount().catch(() => undefined);

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
