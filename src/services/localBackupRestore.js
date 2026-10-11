import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '../database/operations';
import { runMigrations } from '../database/migrations';
import { exportLocalDatabasePayload, parseBackupDocument } from './localBackupExport';

const SNAPSHOT_KEY = 'amplifood.backup.pre-restore.v1';

export async function snapshotLocalDatabaseBeforeRestore() {
    const payload = await exportLocalDatabasePayload();
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
}

export async function restoreLocalDatabaseFromBase64(base64) {
    const doc = parseBackupDocument(base64);
    const db = getDatabase();
    await db.execAsync('PRAGMA foreign_keys = OFF');
    for (const tableName of Object.keys(doc.tables)) {
        await db.execAsync(`DELETE FROM ${tableName}`);
        const rows = doc.tables[tableName];
        if (!Array.isArray(rows) || !rows.length) continue;
        for (const row of rows) {
            const cols = Object.keys(row);
            const placeholders = cols.map(() => '?').join(',');
            const values = cols.map((c) => row[c]);
            await db.runAsync(
                `INSERT INTO ${tableName} (${cols.join(',')}) VALUES (${placeholders})`,
                values
            );
        }
    }
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db);
}
