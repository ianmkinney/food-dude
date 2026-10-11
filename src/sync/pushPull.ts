import type { SQLiteDatabase } from 'expo-sqlite';
import { getSyncDeviceId } from './deviceId';
import { SYNC_TABLE_META, type SyncCollection, isSyncableAppSettingKey } from './collections';
import { pullSyncBatch, pushSyncBatch, type RemoteSyncRecord } from './cloudSyncApi';
import { applyRemoteRecord, withSyncSuppress } from './applyRemote';
import { getSyncCursor, setSyncCursor, setLastSyncedAt } from './syncPrefs';
import { incomingWins } from './syncMerge';

const MAX_PUSH = 80;

async function loadRowPayload(
    db: SQLiteDatabase,
    collection: SyncCollection,
    recordId: string
): Promise<Record<string, unknown> | null> {
    const { table, idColumn } = SYNC_TABLE_META[collection];
    const idVal =
        collection === 'app_settings' || collection === 'chat_threads'
            ? recordId
            : Number.isFinite(Number(recordId))
              ? Number(recordId)
              : recordId;
    const row = await db.getFirstAsync<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE ${idColumn} = ?`,
        [idVal]
    );
    return row ?? null;
}

export async function pullAllIncremental(db: SQLiteDatabase): Promise<number> {
    let cursor = await getSyncCursor();
    let applied = 0;
    for (;;) {
        const batch = await pullSyncBatch(cursor);
        if (!batch.records?.length) {
            await setSyncCursor(batch.nextCursor ?? cursor);
            break;
        }
        await withSyncSuppress(db, async () => {
            for (const rec of batch.records) {
                if (await applyRemoteRecord(db, rec)) applied += 1;
            }
        });
        cursor = batch.nextCursor;
        await setSyncCursor(cursor);
        if (!batch.hasMore) break;
    }
    return applied;
}

export async function pushDirtyRecords(db: SQLiteDatabase): Promise<number> {
    const deviceId = await getSyncDeviceId();
    const dirty = await db.getAllAsync<{
        collection: string;
        record_id: string;
        updated_at: number;
        deleted: number;
    }>(
        `SELECT collection, record_id, updated_at, deleted FROM sync_local_meta WHERE dirty = 1 LIMIT ${MAX_PUSH}`
    );
    if (!dirty.length) return 0;

    const records: object[] = [];
    for (const row of dirty) {
        const collection = row.collection as SyncCollection;
        if (!SYNC_TABLE_META[collection]) continue;
        let deleted = Boolean(row.deleted);
        let payload: Record<string, unknown> | null = null;
        if (!deleted) {
            payload = await loadRowPayload(db, collection, row.record_id);
            if (!payload) {
                deleted = true;
            } else if (collection === 'app_settings' && !isSyncableAppSettingKey(String(payload.key))) {
                await db.runAsync(
                    'UPDATE sync_local_meta SET dirty = 0 WHERE collection = ? AND record_id = ?',
                    [collection, row.record_id]
                );
                continue;
            }
        }
        records.push({
            collection,
            recordId: row.record_id,
            updatedAtMs: row.updated_at,
            deviceId,
            deleted,
            payload: deleted ? null : payload,
        });
    }
    if (!records.length) return 0;

    await pushSyncBatch(deviceId, records);
    for (const row of dirty) {
        await db.runAsync(
            'UPDATE sync_local_meta SET dirty = 0, device_id = ? WHERE collection = ? AND record_id = ?',
            [deviceId, row.collection, row.record_id]
        );
    }
    return records.length;
}

/** Merge local rows that are newer than last known meta without wiping server data. */
export async function markLocalNewerForPush(db: SQLiteDatabase): Promise<void> {
    const deviceId = await getSyncDeviceId();
    for (const collection of Object.keys(SYNC_TABLE_META) as SyncCollection[]) {
        const { table, idColumn } = SYNC_TABLE_META[collection];
        const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
        for (const row of rows) {
            if (collection === 'app_settings' && !isSyncableAppSettingKey(String(row.key))) continue;
            const recordId = String(row[idColumn]);
            let updatedAt = Date.now();
            if (row.updated_at != null) updatedAt = Number(row.updated_at);
            else if (row.created_at != null) updatedAt = Number(row.created_at);
            const meta = await db.getFirstAsync<{ updated_at: number; device_id: string; deleted: number; dirty: number }>(
                'SELECT updated_at, device_id, deleted, dirty FROM sync_local_meta WHERE collection = ? AND record_id = ?',
                [collection, recordId]
            );
            const local = meta
                ? { updatedAtMs: Number(meta.updated_at), deviceId: meta.device_id || deviceId, deleted: Boolean(meta.deleted) }
                : null;
            const incoming = { updatedAtMs: updatedAt, deviceId, deleted: false };
            if (incomingWins(local, incoming) && (!meta || meta.dirty === 0)) {
                await db.runAsync(
                    `INSERT INTO sync_local_meta (collection, record_id, updated_at, device_id, deleted, dirty)
                     VALUES (?, ?, ?, ?, 0, 1)
                     ON CONFLICT(collection, record_id) DO UPDATE SET
                       updated_at = excluded.updated_at,
                       device_id = excluded.device_id,
                       dirty = 1`,
                    [collection, recordId, updatedAt, deviceId]
                );
            }
        }
    }
}
