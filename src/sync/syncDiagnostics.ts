export type SyncDiagnostics = {
    lastPullAt: number | null;
    lastPushAt: number | null;
    lastPullApplied: number;
    lastPushRecords: number;
    dirtyCount: number;
    lastError: string | null;
};

const defaultState: SyncDiagnostics = {
    lastPullAt: null,
    lastPushAt: null,
    lastPullApplied: 0,
    lastPushRecords: 0,
    dirtyCount: 0,
    lastError: null,
};

let state: SyncDiagnostics = { ...defaultState };

type Listener = (next: SyncDiagnostics) => void;
const listeners = new Set<Listener>();

export function getSyncDiagnostics(): SyncDiagnostics {
    return state;
}

export function subscribeSyncDiagnostics(listener: Listener): () => void {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
}

export function patchSyncDiagnostics(patch: Partial<SyncDiagnostics>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
}

export function resetSyncDiagnostics() {
    state = { ...defaultState };
    listeners.forEach((l) => l(state));
}
