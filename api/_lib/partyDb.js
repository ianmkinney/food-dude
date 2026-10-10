import { neon, Pool } from '@neondatabase/serverless';
import { PARTY_SCHEMA_ADVISORY_LOCK_KEY, PARTY_SCHEMA_STATEMENTS } from './partySchema.js';

let sqlClient = null;
let schemaReadyPromise = null;

export const MAX_PARTY_IMAGE_BYTES = 500 * 1024;

export function getPartyDatabaseUrl() {
    return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export function isPartyDatabaseConfigured() {
    return Boolean(getPartyDatabaseUrl().trim());
}

async function applyPartySchemaOnce() {
    const url = getPartyDatabaseUrl();
    if (!url) return;

    const pool = new Pool({ connectionString: url });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [PARTY_SCHEMA_ADVISORY_LOCK_KEY]);
        for (const statement of PARTY_SCHEMA_STATEMENTS) {
            await client.query(statement);
        }
        await client.query('COMMIT');
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

/**
 * Idempotent schema ensure — once per serverless instance (memoized), guarded by pg_advisory_xact_lock.
 */
export function isPartyAutoMigrateEnabled() {
    const flag = process.env.PARTY_AUTO_MIGRATE;
    if (flag === '0' || flag === 'false' || flag === 'off') return false;
    return true;
}

export function ensurePartySchema() {
    if (!isPartyDatabaseConfigured()) {
        return Promise.resolve();
    }
    if (!isPartyAutoMigrateEnabled()) {
        return Promise.resolve();
    }
    if (!schemaReadyPromise) {
        schemaReadyPromise = applyPartySchemaOnce().catch((error) => {
            schemaReadyPromise = null;
            throw error;
        });
    }
    return schemaReadyPromise;
}

export async function getPartySql() {
    const url = getPartyDatabaseUrl();
    if (!url) {
        throw new Error('party_db_unconfigured');
    }
    await ensurePartySchema();
    if (!sqlClient) {
        sqlClient = neon(url);
    }
    return sqlClient;
}
