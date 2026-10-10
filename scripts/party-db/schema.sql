-- AmpliFood party-only server schema (Neon Postgres). Idempotent.
-- Canonical statement list for runtime ensure: api/_lib/partySchema.js (keep in sync).
-- Uses built-in gen_random_uuid() (Postgres 13+); no extensions required.

CREATE TABLE IF NOT EXISTS parties (
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
);

CREATE TABLE IF NOT EXISTS party_members (
    member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'pending')),
    member_token_hash TEXT,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_party_members_party_id ON party_members(party_id);

CREATE TABLE IF NOT EXISTS party_meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    recipe_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_meals_party_id ON party_meals(party_id);

CREATE TABLE IF NOT EXISTS invite_tokens (
    token TEXT PRIMARY KEY,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_party_id ON invite_tokens(party_id);

CREATE TABLE IF NOT EXISTS rate_limits (
    rate_key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (rate_key, window_start)
);

ALTER TABLE parties ADD COLUMN IF NOT EXISTS image_bytea BYTEA;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS image_content_type TEXT;
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
UPDATE invite_tokens SET expires_at = created_at + interval '30 days' WHERE expires_at IS NULL;
