import { encryptSyncPayload, decryptSyncPayload, requireSyncEncryptionKey } from './syncCrypto.js';
import { mergePushBatch } from './syncMerge.js';
import { MAX_SYNC_PULL_RECORDS, MAX_SYNC_PUSH_RECORDS, MAX_SYNC_RECORD_BYTES, SYNC_COLLECTIONS } from './syncConstants.js';

function recordKey(collection, recordId) {
    return `${collection}\0${recordId}`;
}

function payloadByteLength(payload) {
    if (payload == null) return 0;
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

/** @param {import('@neondatabase/serverless').NeonQueryFunction} sql */
export async function ensureSyncStateRow(sql, userSub) {
    await sql`
        INSERT INTO user_sync_state (user_sub, next_seq)
        VALUES (${userSub}, 1)
        ON CONFLICT (user_sub) DO NOTHING`;
}

/** @param {import('@neondatabase/serverless').NeonQueryFunction} sql */
async function allocateSeq(sql, userSub, count) {
    const rows = await sql`
        UPDATE user_sync_state
        SET next_seq = next_seq + ${count}
        WHERE user_sub = ${userSub}
        RETURNING next_seq`;
    const end = Number(rows[0]?.next_seq ?? count);
    const start = end - count + 1;
    return { start, end };
}

/** @param {import('@neondatabase/serverless').NeonQueryFunction} sql */
export async function handleSyncPush(sql, userSub, deviceId, records) {
    requireSyncEncryptionKey();
    if (!Array.isArray(records) || records.length > MAX_SYNC_PUSH_RECORDS) {
        return { error: 'bad_request', message: `At most ${MAX_SYNC_PUSH_RECORDS} records per push.` };
    }
    const normalized = [];
    for (const r of records) {
        const collection = String(r.collection || '').slice(0, 64);
        const recordId = String(r.recordId || '').slice(0, 128);
        if (!SYNC_COLLECTIONS.has(collection) || !recordId) {
            return { error: 'bad_request', message: 'Invalid collection or recordId.' };
        }
        const bytes = payloadByteLength(r.deleted ? null : r.payload);
        if (bytes > MAX_SYNC_RECORD_BYTES) {
            return { error: 'bad_request', message: `Record payload too large (max ${MAX_SYNC_RECORD_BYTES} bytes).` };
        }
        normalized.push({
            collection,
            recordId,
            updatedAtMs: Number(r.updatedAtMs) || 0,
            deviceId: String(r.deviceId || deviceId || '').slice(0, 64),
            deleted: Boolean(r.deleted),
            payload: r.deleted ? null : r.payload,
        });
    }
    if (!normalized.length) {
        return { ok: true, accepted: 0, skipped: 0 };
    }

    await ensureSyncStateRow(sql, userSub);

    const serverByKey = new Map();
    for (const r of normalized) {
        const existingRows = await sql`
            SELECT collection, record_id, updated_at_ms, device_id, deleted, ciphertext
            FROM user_sync_records
            WHERE user_sub = ${userSub}
              AND collection = ${r.collection}
              AND record_id = ${r.recordId}
            LIMIT 1`;
        const row = existingRows[0];
        if (!row) continue;
        let payload = null;
        if (!row.deleted && row.ciphertext) {
            try {
                payload = decryptSyncPayload(userSub, row.ciphertext);
            } catch {
                payload = null;
            }
        }
        serverByKey.set(recordKey(row.collection, row.record_id), {
            collection: row.collection,
            recordId: row.record_id,
            updatedAtMs: Number(row.updated_at_ms),
            deviceId: row.device_id,
            deleted: row.deleted,
            payload,
        });
    }

    const { accepted, skipped } = mergePushBatch(serverByKey, normalized);

    if (!accepted.length) {
        return { ok: true, accepted: 0, skipped: skipped.length, skippedDetails: skipped };
    }

    const { start } = await allocateSeq(sql, userSub, accepted.length);
    let seq = start;
    for (const rec of accepted) {
        const cipher = rec.deleted ? Buffer.alloc(0) : encryptSyncPayload(userSub, rec.payload);
        await sql`
            INSERT INTO user_sync_records (
                user_sub, collection, record_id, seq, updated_at_ms, device_id, deleted, ciphertext
            ) VALUES (
                ${userSub}, ${rec.collection}, ${rec.recordId}, ${seq},
                ${rec.updatedAtMs}, ${rec.deviceId}, ${rec.deleted}, ${cipher}
            )
            ON CONFLICT (user_sub, collection, record_id) DO UPDATE SET
                seq = EXCLUDED.seq,
                updated_at_ms = EXCLUDED.updated_at_ms,
                device_id = EXCLUDED.device_id,
                deleted = EXCLUDED.deleted,
                ciphertext = EXCLUDED.ciphertext`;
        seq += 1;
    }

    await sql`
        UPDATE user_sync_state SET last_push_at = now() WHERE user_sub = ${userSub}`;

    return { ok: true, accepted: accepted.length, skipped: skipped.length };
}

/** @param {import('@neondatabase/serverless').NeonQueryFunction} sql */
export async function handleSyncPull(sql, userSub, cursor) {
    requireSyncEncryptionKey();
    await ensureSyncStateRow(sql, userSub);
    const after = Math.max(0, Number(cursor) || 0);
    const rows = await sql`
        SELECT collection, record_id, seq, updated_at_ms, device_id, deleted, ciphertext
        FROM user_sync_records
        WHERE user_sub = ${userSub} AND seq > ${after}
        ORDER BY seq ASC
        LIMIT ${MAX_SYNC_PULL_RECORDS + 1}`;

    const hasMore = rows.length > MAX_SYNC_PULL_RECORDS;
    const slice = hasMore ? rows.slice(0, MAX_SYNC_PULL_RECORDS) : rows;
    const records = [];
    for (const row of slice) {
        let payload = null;
        if (!row.deleted && row.ciphertext?.length) {
            payload = decryptSyncPayload(userSub, row.ciphertext);
        }
        records.push({
            collection: row.collection,
            recordId: row.record_id,
            seq: Number(row.seq),
            updatedAtMs: Number(row.updated_at_ms),
            deviceId: row.device_id,
            deleted: Boolean(row.deleted),
            payload,
        });
    }
    const nextCursor = slice.length ? Number(slice[slice.length - 1].seq) : after;
    await sql`
        UPDATE user_sync_state SET last_pull_at = now() WHERE user_sub = ${userSub}`;
    return { ok: true, records, nextCursor, hasMore };
}

/** @param {import('@neondatabase/serverless').NeonQueryFunction} sql */
export async function handleSyncStatus(sql, userSub) {
    requireSyncEncryptionKey();
    await ensureSyncStateRow(sql, userSub);
    const rows = await sql`
        SELECT next_seq, last_push_at, last_pull_at
        FROM user_sync_state
        WHERE user_sub = ${userSub}
        LIMIT 1`;
    const row = rows[0];
    const countRows = await sql`
        SELECT COUNT(*)::int AS n FROM user_sync_records WHERE user_sub = ${userSub}`;
    return {
        ok: true,
        recordCount: countRows[0]?.n ?? 0,
        nextSeq: row ? Number(row.next_seq) - 1 : 0,
        lastPushAt: row?.last_push_at ? new Date(row.last_push_at).getTime() : null,
        lastPullAt: row?.last_pull_at ? new Date(row.last_pull_at).getTime() : null,
    };
}
