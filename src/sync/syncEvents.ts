export type SyncDataEvent = {
    kind: 'pull' | 'push' | 'party';
    applied?: number;
    collections?: string[];
};

type Listener = (event: SyncDataEvent) => void;
const listeners = new Set<Listener>();

export function subscribeSyncData(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function emitSyncData(event: SyncDataEvent) {
    listeners.forEach((l) => {
        try {
            l(event);
        } catch {
            // ignore subscriber errors
        }
    });
}
