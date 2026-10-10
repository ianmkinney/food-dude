import { Pool } from '@neondatabase/serverless';
import { ensurePartySchema, getPartyDatabaseUrl } from './partyDb.js';

/**
 * Run statements in a single Postgres transaction (Pool client).
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withPartyTransaction(fn) {
    await ensurePartySchema();
    const url = getPartyDatabaseUrl();
    const pool = new Pool({ connectionString: url });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}
