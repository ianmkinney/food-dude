export type SyncRecordLike = {
    updatedAtMs: number;
    deviceId: string;
    deleted?: boolean;
};

export function pickSyncWinner<T extends SyncRecordLike>(a: T | null | undefined, b: T | null | undefined): T | null {
    if (!a) return b ?? null;
    if (!b) return a;
    if (b.updatedAtMs > a.updatedAtMs) return b;
    if (b.updatedAtMs < a.updatedAtMs) return a;
    const ad = String(a.deviceId || '');
    const bd = String(b.deviceId || '');
    return bd > ad ? b : a;
}
