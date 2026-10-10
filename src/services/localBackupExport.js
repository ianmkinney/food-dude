import { gzipSync, gunzipSync, strToU8 } from 'fflate';
import Constants from 'expo-constants';
import { getDatabase } from '../database/operations';
import { getSchemaVersion } from '../database/migrations';

const REDACT_COLUMNS = {
    parties: ['sync_secret'],
};

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

export async function exportLocalDatabasePayload() {
    const db = getDatabase();
    const tables = await db.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const data = {};
    for (const row of tables) {
        const name = row.name;
        const rows = await db.getAllAsync(`SELECT * FROM ${name}`);
        const redact = REDACT_COLUMNS[name];
        if (redact?.length) {
            data[name] = rows.map((r) => {
                const copy = { ...r };
                for (const col of redact) delete copy[col];
                return copy;
            });
        } else {
            data[name] = rows;
        }
    }
    const schemaVersion = await getSchemaVersion(db);
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const json = JSON.stringify({
        format: 'amplifood-backup-v1',
        exportedAt: Date.now(),
        appVersion,
        schemaVersion,
        tables: data,
    });
    const compressed = gzipSync(strToU8(json));
    const base64 = bytesToBase64(compressed);
    return { base64, schemaVersion, appVersion, byteLength: compressed.length };
}

export function parseBackupDocument(base64) {
    const bytes = base64ToBytes(base64);
    const jsonBytes = gunzipSync(bytes);
    const text = new TextDecoder().decode(jsonBytes);
    const doc = JSON.parse(text);
    if (doc.format !== 'amplifood-backup-v1' || !doc.tables) {
        throw new Error('Unrecognized backup format.');
    }
    return doc;
}
