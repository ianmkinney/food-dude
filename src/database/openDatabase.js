import * as SQLite from 'expo-sqlite';

export const isOpfsBusyError = () => false;

/** Native: one app instance owns its database file. See openDatabase.web.js. */
export async function openAppDatabase(fileName) {
    const db = await SQLite.openDatabaseAsync(fileName);
    return { db, mode: 'persistent' };
}
