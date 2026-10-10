const IDB_NAME = 'amplifood-db-mirror';
const IDB_STORE = 'snapshots';
const SNAPSHOT_KEY = 'fooddude.db';

function openMirrorDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not available'));
            return;
        }
        const request = indexedDB.open(IDB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(IDB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
    });
}

/** @param {Uint8Array} bytes */
export async function saveDatabaseSnapshot(bytes) {
    if (!bytes?.byteLength) return;
    const idb = await openMirrorDb();
    await new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(bytes, SNAPSHOT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    idb.close();
}

/** @returns {Promise<Uint8Array | null>} */
export async function loadDatabaseSnapshot() {
    if (typeof indexedDB === 'undefined') return null;
    try {
        const idb = await openMirrorDb();
        const bytes = await new Promise((resolve, reject) => {
            const tx = idb.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(SNAPSHOT_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        idb.close();
        return bytes instanceof Uint8Array ? bytes : null;
    } catch (error) {
        console.warn('[db] snapshot load failed:', error?.message || error);
        return null;
    }
}
