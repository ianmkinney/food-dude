/** Breaks the openDatabase ↔ operations import cycle for web shutdown. */
let databaseRef = null;

export function registerDatabase(database) {
    databaseRef = database;
}

export async function closeRegisteredDatabase() {
    if (!databaseRef) return;
    try {
        await databaseRef.closeAsync();
    } catch (error) {
        console.warn('[db] close failed:', error?.message || error);
    } finally {
        databaseRef = null;
    }
}
