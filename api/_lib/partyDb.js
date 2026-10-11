import { neon, Pool } from '@neondatabase/serverless';
import {
    BACKUP_SYNC_SCHEMA_STATEMENTS,
    PARTY_CORE_SCHEMA_STATEMENTS,
    PARTY_IDENTITY_MIGRATION_KEY,
    PARTY_MEMBERS_IDENTITY_UNIQUE_INDEX,
    PARTY_SCHEMA_ADVISORY_LOCK_KEY,
    PARTY_SCHEMA_MIGRATIONS_DDL,
} from './partySchema.js';
import { mergeDuplicatePartyMembersSafe } from './partyMembers.js';

let sqlClient = null;
let backupSqlClient = null;
let schemaReadyPromise = null;
let backupSchemaReadyPromise = null;

export const MAX_PARTY_IMAGE_BYTES = 500 * 1024;

export function getPartyDatabaseUrl() {
    return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export function isPartyDatabaseConfigured() {
    return Boolean(getPartyDatabaseUrl().trim());
}

export function isPartyAutoMigrateEnabled() {
    const flag = process.env.PARTY_AUTO_MIGRATE;
    if (flag === '0' || flag === 'false' || flag === 'off') return false;
    return true;
}

async function runStatements(client, statements) {
    for (const statement of statements) {
        await client.query(statement);
    }
}

async function applyBackupSchemaOnce() {
    const url = getPartyDatabaseUrl();
    if (!url) return;

    const pool = new Pool({ connectionString: url });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await runStatements(client, BACKUP_SYNC_SCHEMA_STATEMENTS);
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

async function applyPartyIdentityMigration(client) {
    const existing = await client.query(
        `SELECT 1 FROM party_schema_migrations WHERE key = $1 LIMIT 1`,
        [PARTY_IDENTITY_MIGRATION_KEY]
    );
    if (existing.rows.length) {
        await client.query(PARTY_MEMBERS_IDENTITY_UNIQUE_INDEX);
        return;
    }

    try {
        await mergeDuplicatePartyMembersSafe(client);
        await client.query(PARTY_MEMBERS_IDENTITY_UNIQUE_INDEX);
        await client.query(`INSERT INTO party_schema_migrations (key) VALUES ($1)`, [
            PARTY_IDENTITY_MIGRATION_KEY,
        ]);
    } catch (error) {
        if (error?.code === '23505') {
            await mergeDuplicatePartyMembersSafe(client);
            await client.query(PARTY_MEMBERS_IDENTITY_UNIQUE_INDEX);
            await client.query(
                `INSERT INTO party_schema_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`,
                [PARTY_IDENTITY_MIGRATION_KEY]
            );
            return;
        }
        throw error;
    }
}

async function applyPartySchemaOnce() {
    const url = getPartyDatabaseUrl();
    if (!url) return;

    const pool = new Pool({ connectionString: url });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [PARTY_SCHEMA_ADVISORY_LOCK_KEY]);
        await runStatements(client, BACKUP_SYNC_SCHEMA_STATEMENTS);
        await runStatements(client, PARTY_CORE_SCHEMA_STATEMENTS);
        await client.query(PARTY_SCHEMA_MIGRATIONS_DDL);
        await applyPartyIdentityMigration(client);
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
 * Backup + sync DDL only (no party member dedupe / identity migration).
 */
export function ensureBackupSchema() {
    if (!isPartyDatabaseConfigured()) {
        return Promise.resolve();
    }
    if (!isPartyAutoMigrateEnabled()) {
        return Promise.resolve();
    }
    if (!backupSchemaReadyPromise) {
        backupSchemaReadyPromise = applyBackupSchemaOnce().catch((error) => {
            backupSchemaReadyPromise = null;
            throw error;
        });
    }
    return backupSchemaReadyPromise;
}

/**
 * Full party schema + one-time identity dedupe (memoized per serverless instance).
 */
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

export async function getBackupSql() {
    const url = getPartyDatabaseUrl();
    if (!url) {
        throw new Error('party_db_unconfigured');
    }
    await ensureBackupSchema();
    if (!backupSqlClient) {
        backupSqlClient = neon(url);
    }
    return backupSqlClient;
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
