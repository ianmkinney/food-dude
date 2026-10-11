import type { SyncUiStatus } from '../context/GoogleAccountContext';

type Listener = (status: SyncUiStatus) => void;
const listeners = new Set<Listener>();

export function subscribeSyncEngineStatus(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function emitSyncEngineStatus(status: SyncUiStatus) {
    listeners.forEach((l) => l(status));
}
