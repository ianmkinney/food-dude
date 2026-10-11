import type { SQLiteDatabase } from 'expo-sqlite';
import { SYNC_TABLE_META, type SyncCollection, isSyncableAppSettingKey } from './collections';
import { incomingWins } from './syncMerge';
import type { RemoteSyncRecord } from './cloudSyncApi';

export async function withSyncSuppress(db: SQLiteDatabase, fn: () => Promise<void>) {
    await db.runAsync('UPDATE sync_control SET suppress = 1 WHERE id = 1');
    try {
        await fn();
    } finally {
        await db.runAsync('UPDATE sync_control SET suppress = 0 WHERE id = 1');
    }
}

async function getLocalMeta(
    db: SQLiteDatabase,
    collection: string,
    recordId: string
): Promise<{ updatedAtMs: number; deviceId: string; deleted: boolean } | null> {
    const row = await db.getFirstAsync<{ updated_at: number; device_id: string; deleted: number }>(
        'SELECT updated_at, device_id, deleted FROM sync_local_meta WHERE collection = ? AND record_id = ?',
        [collection, recordId]
    );
    if (!row) return null;
    return {
        updatedAtMs: Number(row.updated_at),
        deviceId: row.device_id || '',
        deleted: Boolean(row.deleted),
    };
}

async function setLocalMeta(
    db: SQLiteDatabase,
    collection: string,
    recordId: string,
    updatedAtMs: number,
    deviceId: string,
    deleted: boolean
) {
    await db.runAsync(
        `INSERT INTO sync_local_meta (collection, record_id, updated_at, device_id, deleted, dirty)
         VALUES (?, ?, ?, ?, ?, 0)
         ON CONFLICT(collection, record_id) DO UPDATE SET
           updated_at = excluded.updated_at,
           device_id = excluded.device_id,
           deleted = excluded.deleted,
           dirty = 0`,
        [collection, recordId, updatedAtMs, deviceId, deleted ? 1 : 0]
    );
}

function bindId(collection: SyncCollection, recordId: string): string | number {
    if (collection === 'app_settings' || collection === 'chat_threads') return recordId;
    const n = Number(recordId);
    return Number.isFinite(n) ? n : recordId;
}

async function deleteLocalRow(db: SQLiteDatabase, collection: SyncCollection, recordId: string) {
    const { table, idColumn } = SYNC_TABLE_META[collection];
    await db.runAsync(`DELETE FROM ${table} WHERE ${idColumn} = ?`, [bindId(collection, recordId)]);
}

async function upsertLocalRow(db: SQLiteDatabase, collection: SyncCollection, payload: Record<string, unknown>) {
    const { table, idColumn } = SYNC_TABLE_META[collection];
    const keys = Object.keys(payload).filter((k) => payload[k] !== undefined);
    if (!keys.length) return;
    const cols = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => payload[k]);
    await db.runAsync(`INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`, values as (string | number | null)[]);
}

/** Apply remote record if it wins LWW against local meta + row. */
export async function applyRemoteRecord(db: SQLiteDatabase, remote: RemoteSyncRecord): Promise<boolean> {
    const collection = remote.collection as SyncCollection;
    if (!SYNC_TABLE_META[collection]) return false;
    if (collection === 'app_settings' && remote.payload?.key && !isSyncableAppSettingKey(String(remote.payload.key))) {
        return false;
    }

    const localMeta = await getLocalMeta(db, collection, remote.recordId);
    const localRec = localMeta
        ? { updatedAtMs: localMeta.updatedAtMs, deviceId: localMeta.deviceId, deleted: localMeta.deleted }
        : null;
    const remoteRec = {
        updatedAtMs: remote.updatedAtMs,
        deviceId: remote.deviceId,
        deleted: remote.deleted,
    };
    if (!incomingWins(localRec, remoteRec)) return false;

    if (remote.deleted) {
        await deleteLocalRow(db, collection, remote.recordId);
    } else if (remote.payload) {
        await upsertLocalRow(db, collection, remote.payload);
    }
    await setLocalMeta(db, collection, remote.recordId, remote.updatedAtMs, remote.deviceId, remote.deleted);
    return true;
}
