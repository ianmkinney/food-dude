/** Idempotent DDL for party-only Neon schema. Keep in sync with scripts/party-db/schema.sql */

export const PARTY_SCHEMA_ADVISORY_LOCK_KEY = '9037428910123';

/** Recorded in `party_schema_migrations` after identity dedupe + partial unique index. */
export const PARTY_IDENTITY_MIGRATION_KEY = 'party_members_identity_v1';

export const PARTY_SCHEMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS party_schema_migrations (
    key TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

/** Backup + encrypted sync — safe to run without party member migrations. */
export const BACKUP_SYNC_SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS user_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_sub TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    app_version TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    data BYTEA NOT NULL
)`,
    'CREATE INDEX IF NOT EXISTS idx_user_backups_sub_created ON user_backups(user_sub, created_at DESC)',
    `CREATE TABLE IF NOT EXISTS user_sync_state (
    user_sub TEXT PRIMARY KEY,
    next_seq BIGINT NOT NULL DEFAULT 1,
    last_push_at TIMESTAMPTZ,
    last_pull_at TIMESTAMPTZ
)`,
    `CREATE TABLE IF NOT EXISTS user_sync_records (
    user_sub TEXT NOT NULL,
    collection TEXT NOT NULL,
    record_id TEXT NOT NULL,
    seq BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL,
    device_id TEXT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    ciphertext BYTEA NOT NULL,
    PRIMARY KEY (user_sub, collection, record_id)
)`,
    'CREATE INDEX IF NOT EXISTS idx_user_sync_records_seq ON user_sync_records(user_sub, seq)',
];

/** Party tables and indexes except the partial unique index on (party_id, identity_key). */
export const PARTY_CORE_SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    image_url TEXT,
    image_bytea BYTEA,
    image_content_type TEXT,
    owner_sub TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`,
    `CREATE TABLE IF NOT EXISTS party_members (
    member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'pending')),
    member_token_hash TEXT,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at TIMESTAMPTZ
)`,
    'CREATE INDEX IF NOT EXISTS idx_party_members_party_id ON party_members(party_id)',
    'ALTER TABLE party_members ADD COLUMN IF NOT EXISTS google_sub TEXT',
    'ALTER TABLE party_members ADD COLUMN IF NOT EXISTS identity_key TEXT',
    `CREATE TABLE IF NOT EXISTS party_meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    recipe_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`,
    'CREATE INDEX IF NOT EXISTS idx_party_meals_party_id ON party_meals(party_id)',
    `CREATE TABLE IF NOT EXISTS invite_tokens (
    token TEXT PRIMARY KEY,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
)`,
    'CREATE INDEX IF NOT EXISTS idx_invite_tokens_party_id ON invite_tokens(party_id)',
    `CREATE TABLE IF NOT EXISTS rate_limits (
    rate_key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (rate_key, window_start)
)`,
    'ALTER TABLE parties ADD COLUMN IF NOT EXISTS image_bytea BYTEA',
    'ALTER TABLE parties ADD COLUMN IF NOT EXISTS image_content_type TEXT',
    'ALTER TABLE parties ADD COLUMN IF NOT EXISTS image_thumb_url TEXT',
    'ALTER TABLE parties ADD COLUMN IF NOT EXISTS image_thumb_bytea BYTEA',
    'ALTER TABLE parties ADD COLUMN IF NOT EXISTS image_thumb_content_type TEXT',
    'ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ',
    `UPDATE invite_tokens SET expires_at = created_at + interval '30 days'
     WHERE expires_at IS NULL`,
    'ALTER TABLE party_meals ADD COLUMN IF NOT EXISTS recipe_meta JSONB NOT NULL DEFAULT \'{}\'::jsonb',
    `CREATE TABLE IF NOT EXISTS party_meal_ingredient_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    meal_id UUID NOT NULL REFERENCES party_meals(id) ON DELETE CASCADE,
    recipe_id TEXT NOT NULL,
    ingredient_key TEXT NOT NULL,
    ingredient_name TEXT NOT NULL,
    claimed_by_member_id UUID REFERENCES party_members(member_id) ON DELETE SET NULL,
    claimed_by_display_name TEXT,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (meal_id, recipe_id, ingredient_key)
)`,
    'CREATE INDEX IF NOT EXISTS idx_party_meal_claims_meal ON party_meal_ingredient_claims(meal_id)',
];

export const PARTY_MEMBERS_IDENTITY_UNIQUE_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS idx_party_members_party_identity
        ON party_members(party_id, identity_key)
        WHERE status = 'active' AND identity_key IS NOT NULL`;

/** Full bootstrap for `scripts/party-db/migrate.mjs` (index applied after dedupe in migrate script). */
export const PARTY_SCHEMA_STATEMENTS = [
    ...BACKUP_SYNC_SCHEMA_STATEMENTS,
    ...PARTY_CORE_SCHEMA_STATEMENTS,
];
