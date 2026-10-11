#!/usr/bin/env node
/**
 * Apply party-only Neon schema. Usage:
 *   DATABASE_URL=postgres://... node scripts/party-db/migrate.mjs
 */
import { Pool } from '@neondatabase/serverless';
import {
    BACKUP_SYNC_SCHEMA_STATEMENTS,
    PARTY_CORE_SCHEMA_STATEMENTS,
    PARTY_IDENTITY_MIGRATION_KEY,
    PARTY_MEMBERS_IDENTITY_UNIQUE_INDEX,
    PARTY_SCHEMA_ADVISORY_LOCK_KEY,
    PARTY_SCHEMA_MIGRATIONS_DDL,
} from '../../api/_lib/partySchema.js';
import { mergeDuplicatePartyMembersSafe } from '../../api/_lib/partyMembers.js';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
    console.error('Set DATABASE_URL or POSTGRES_URL');
    process.exit(1);
}

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [PARTY_SCHEMA_ADVISORY_LOCK_KEY]);
    for (const statement of [...BACKUP_SYNC_SCHEMA_STATEMENTS, ...PARTY_CORE_SCHEMA_STATEMENTS]) {
        await client.query(statement);
    }
    await client.query(PARTY_SCHEMA_MIGRATIONS_DDL);
    await mergeDuplicatePartyMembersSafe(client);
    await client.query(PARTY_MEMBERS_IDENTITY_UNIQUE_INDEX);
    await client.query(`INSERT INTO party_schema_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`, [
        PARTY_IDENTITY_MIGRATION_KEY,
    ]);
    await client.query('COMMIT');
    console.log('Party schema migration complete.');
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    client.release();
    await pool.end();
}
