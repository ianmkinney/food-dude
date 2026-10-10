import { neon } from '@neondatabase/serverless';

let sqlClient = null;

export function getPartyDatabaseUrl() {
    return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export function isPartyDatabaseConfigured() {
    return Boolean(getPartyDatabaseUrl().trim());
}

export function getPartySql() {
    const url = getPartyDatabaseUrl();
    if (!url) {
        throw new Error('party_db_unconfigured');
    }
    if (!sqlClient) {
        sqlClient = neon(url);
    }
    return sqlClient;
}
