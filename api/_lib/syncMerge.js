/**
 * Last-write-wins merge for per-record sync (tie-break: lexicographic device_id).
 * @typedef {{ updatedAtMs: number, deviceId: string, deleted?: boolean, payload?: unknown }} SyncRecord
 */

/** @param {SyncRecord | null | undefined} a @param {SyncRecord | null | undefined} b */
export function incomingWins(existing, incoming) {
    const winner = pickSyncWinner(existing ?? null, incoming);
    return winner.updatedAtMs === incoming.updatedAtMs && winner.deviceId === incoming.deviceId;
}

export function pickSyncWinner(a, b) {
    if (!a) return b ?? null;
    if (!b) return a;
    if (b.updatedAtMs > a.updatedAtMs) return b;
    if (b.updatedAtMs < a.updatedAtMs) return a;
    const ad = String(a.deviceId || '');
    const bd = String(b.deviceId || '');
    return bd > ad ? b : a;
}

/**
 * Merge incoming push batch against server rows.
 * @param {Map<string, SyncRecord & { collection: string, recordId: string }>} serverByKey
 * @param {Array<{ collection: string, recordId: string, updatedAtMs: number, deviceId: string, deleted?: boolean, payload?: unknown }>} incoming
 */
export function mergePushBatch(serverByKey, incoming) {
    const accepted = [];
    const skipped = [];
    for (const row of incoming) {
        const key = `${row.collection}\0${row.recordId}`;
        const existing = serverByKey.get(key);
        const incomingRec = {
            updatedAtMs: Number(row.updatedAtMs) || 0,
            deviceId: String(row.deviceId || ''),
            deleted: Boolean(row.deleted),
            payload: row.deleted ? null : row.payload,
            collection: row.collection,
            recordId: row.recordId,
        };
        if (!incomingRec.collection || !incomingRec.recordId) {
            skipped.push({ collection: row.collection, recordId: row.recordId, reason: 'invalid' });
            continue;
        }
        const existingRec = existing
            ? {
                  updatedAtMs: existing.updatedAtMs,
                  deviceId: existing.deviceId,
                  deleted: existing.deleted,
                  payload: existing.payload,
              }
            : null;
        if (!existingRec) {
            accepted.push(incomingRec);
            serverByKey.set(key, incomingRec);
            continue;
        }
        if (!incomingWins(existingRec, incomingRec)) {
            skipped.push({ collection: row.collection, recordId: row.recordId, reason: 'stale' });
            continue;
        }
        if (
            incomingRec.updatedAtMs === existingRec.updatedAtMs &&
            incomingRec.deviceId === existingRec.deviceId
        ) {
            skipped.push({ collection: row.collection, recordId: row.recordId, reason: 'not_newer' });
            continue;
        }
        accepted.push(incomingRec);
        serverByKey.set(key, incomingRec);
    }
    return { accepted, skipped };
}
