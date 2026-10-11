/**
 * Idempotent sync_local_meta + triggers for encrypted cloud sync.
 * @param {import('expo-sqlite').SQLiteDatabase} db
 */
import { SYNC_COLLECTIONS, SYNC_TABLE_META, isSyncableAppSettingKey } from '../sync/collections';

const upsertMetaSql = (collection, recordIdExpr, updatedExpr) => `
  INSERT INTO sync_local_meta (collection, record_id, updated_at, device_id, deleted, dirty)
  VALUES ('${collection}', ${recordIdExpr}, ${updatedExpr}, '', 0, 1)
  ON CONFLICT(collection, record_id) DO UPDATE SET
    updated_at = excluded.updated_at,
    deleted = 0,
    dirty = 1;
`;

const deleteMetaSql = (collection, recordIdExpr) => `
  INSERT INTO sync_local_meta (collection, record_id, updated_at, device_id, deleted, dirty)
  VALUES ('${collection}', ${recordIdExpr}, CAST((strftime('%s','now') * 1000) AS INTEGER), '', 1, 1)
  ON CONFLICT(collection, record_id) DO UPDATE SET
    updated_at = excluded.updated_at,
    deleted = 1,
    dirty = 1;
`;

export async function applySyncV17(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_control (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        suppress INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO sync_control (id, suppress) VALUES (1, 0);

      CREATE TABLE IF NOT EXISTS sync_local_meta (
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        device_id TEXT NOT NULL DEFAULT '',
        deleted INTEGER NOT NULL DEFAULT 0,
        dirty INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (collection, record_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sync_local_meta_dirty ON sync_local_meta(dirty) WHERE dirty = 1;
    `);

    for (const collection of SYNC_COLLECTIONS) {
        const meta = SYNC_TABLE_META[collection];
        const table = meta.table;
        const idCol = meta.idColumn;
        const recordIdExpr = collection === 'app_settings' ? `NEW.${idCol}` : `CAST(NEW.${idCol} AS TEXT)`;
        const oldIdExpr = collection === 'app_settings' ? `OLD.${idCol}` : `CAST(OLD.${idCol} AS TEXT)`;
        const updatedExpr = meta.updatedExpr;

        const whenBase = `(SELECT suppress FROM sync_control WHERE id = 1) = 0`;
        const whenApp =
            collection === 'app_settings'
                ? `${whenBase} AND lower(NEW.key) NOT LIKE '%openrouter%' AND lower(NEW.key) NOT LIKE '%api_key%' AND lower(NEW.key) NOT LIKE '%apikey%' AND lower(NEW.key) NOT LIKE '%byok%' AND NEW.key NOT LIKE 'amplifood.elevenlabs%' AND NEW.key NOT LIKE 'amplifood.owner.session%'`
                : whenBase;
        const whenAppOld =
            collection === 'app_settings'
                ? `${whenBase} AND lower(OLD.key) NOT LIKE '%openrouter%' AND lower(OLD.key) NOT LIKE '%api_key%' AND lower(OLD.key) NOT LIKE '%apikey%' AND lower(OLD.key) NOT LIKE '%byok%' AND OLD.key NOT LIKE 'amplifood.elevenlabs%' AND OLD.key NOT LIKE 'amplifood.owner.session%'`
                : whenBase;

        await db.execAsync(`DROP TRIGGER IF EXISTS ${table}_sync_ai;`);
        await db.execAsync(`DROP TRIGGER IF EXISTS ${table}_sync_au;`);
        await db.execAsync(`DROP TRIGGER IF EXISTS ${table}_sync_ad;`);

        await db.execAsync(`
          CREATE TRIGGER ${table}_sync_ai AFTER INSERT ON ${table}
          WHEN ${whenApp}
          BEGIN
            ${upsertMetaSql(collection, recordIdExpr, updatedExpr)}
          END;
        `);
        await db.execAsync(`
          CREATE TRIGGER ${table}_sync_au AFTER UPDATE ON ${table}
          WHEN ${whenApp}
          BEGIN
            ${upsertMetaSql(collection, recordIdExpr, updatedExpr)}
          END;
        `);
        await db.execAsync(`
          CREATE TRIGGER ${table}_sync_ad AFTER DELETE ON ${table}
          WHEN ${whenAppOld}
          BEGIN
            ${deleteMetaSql(collection, oldIdExpr)}
          END;
        `);
    }

    await backfillSyncMeta(db);
}

async function backfillSyncMeta(db) {
    for (const collection of SYNC_COLLECTIONS) {
        const { table, idColumn } = SYNC_TABLE_META[collection];
        const rows = await db.getAllAsync(`SELECT * FROM ${table}`);
        for (const row of rows) {
            if (collection === 'app_settings' && !isSyncableAppSettingKey(String(row.key))) continue;
            const recordId = String(row[idColumn]);
            let updatedAt = Date.now();
            if (row.updated_at != null) updatedAt = Number(row.updated_at);
            else if (row.created_at != null) updatedAt = Number(row.created_at);
            await db.runAsync(
                `INSERT OR IGNORE INTO sync_local_meta (collection, record_id, updated_at, device_id, deleted, dirty)
                 VALUES (?, ?, ?, '', 0, 0)`,
                [collection, recordId, updatedAt]
            );
        }
    }
}
