#!/usr/bin/env node
/**
 * Apply party-only Neon schema. Usage:
 *   DATABASE_URL=postgres://... node scripts/party-db/migrate.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
    console.error('Set DATABASE_URL or POSTGRES_URL');
    process.exit(1);
}

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
const sqlText = readFileSync(schemaPath, 'utf8');
const pool = new Pool({ connectionString: url });
try {
    await pool.query(sqlText);
    console.log('Party schema migration complete.');
} finally {
    await pool.end();
}
