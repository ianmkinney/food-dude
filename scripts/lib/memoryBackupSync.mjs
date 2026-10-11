import { mergePushBatch } from '../../api/_lib/syncMerge.js';

function recordKey(collection, recordId) {
    return `${collection}\0${recordId}`;
}

/** In-memory stand-in for Neon user_sync_records (shared across Playwright contexts). */
export function createMemoryBackupSyncServer() {
    const records = new Map();
    let nextSeq = 1;
    const state = { lastPushAt: null, lastPullAt: null };

    function handleSyncPush(body) {
        const deviceId = String(body.deviceId || 'e2e-device');
        const incoming = (body.records || []).map((r) => ({
            collection: String(r.collection),
            recordId: String(r.recordId),
            updatedAtMs: Number(r.updatedAtMs) || Date.now(),
            deviceId: String(r.deviceId || deviceId),
            deleted: Boolean(r.deleted),
            payload: r.deleted ? null : r.payload,
        }));
        const serverByKey = new Map();
        for (const r of incoming) {
            const key = recordKey(r.collection, r.recordId);
            const existing = records.get(key);
            if (existing) {
                serverByKey.set(key, {
                    collection: existing.collection,
                    recordId: existing.recordId,
                    updatedAtMs: existing.updatedAtMs,
                    deviceId: existing.deviceId,
                    deleted: existing.deleted,
                    payload: existing.payload,
                });
            }
        }
        const { accepted } = mergePushBatch(serverByKey, incoming);
        for (const rec of accepted) {
            const seq = nextSeq++;
            records.set(recordKey(rec.collection, rec.recordId), { ...rec, seq });
        }
        state.lastPushAt = Date.now();
        return { ok: true, accepted: accepted.length, skipped: incoming.length - accepted.length };
    }

    function handleSyncPull(body) {
        const after = Math.max(0, Number(body.cursor) || 0);
        const rows = [...records.values()]
            .filter((r) => r.seq > after)
            .sort((a, b) => a.seq - b.seq)
            .slice(0, 200);
        const hasMore = records.size > rows.length && rows.length === 200;
        const nextCursor = rows.length ? rows[rows.length - 1].seq : after;
        state.lastPullAt = Date.now();
        return {
            ok: true,
            records: rows.map((r) => ({
                collection: r.collection,
                recordId: r.recordId,
                seq: r.seq,
                updatedAtMs: r.updatedAtMs,
                deviceId: r.deviceId,
                deleted: r.deleted,
                payload: r.payload,
            })),
            nextCursor,
            hasMore,
        };
    }

    return { handleSyncPush, handleSyncPull, state, records };
}
