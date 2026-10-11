/** Party member identity, dedupe, and human-only display helpers (server + shared tests). */

const NON_HUMAN_NAME =
    /^(ampi|amplifood|food\s*dude|ai\s*chef|assistant|system|bot|unknown|party\s*bot)(\s|$|·)/i;

/**
 * @param {{ displayName?: string, display_name?: string, user_name?: string, email?: string | null, status?: string }} member
 */
export function isHumanPartyMember(member) {
    const status = String(member.status || member.member_status || 'active').toLowerCase();
    if (status === 'removed') return false;
    const name = String(
        member.displayName || member.display_name || member.user_name || member.userName || ''
    ).trim();
    if (!name) return false;
    if (NON_HUMAN_NAME.test(name)) return false;
    const lower = name.toLowerCase();
    if (lower === 'owner' || lower === 'member') return false;
    const email = String(member.email || member.member_email || '').toLowerCase();
    if (email.includes('noreply') && email.includes('ampi')) return false;
    return true;
}

/**
 * Stable identity for dedupe within a party.
 * @param {{ email?: string | null, googleSub?: string | null, google_sub?: string | null, memberId?: string, member_id?: string }} input
 */
export function memberIdentityKey(input) {
    const sub = input.googleSub || input.google_sub;
    if (sub) return `sub:${String(sub).trim()}`;
    const email = input.email ? String(input.email).trim().toLowerCase() : '';
    if (email) return `email:${email}`;
    const mid = input.memberId || input.member_id;
    if (mid) return `mid:${String(mid)}`;
    return null;
}

/**
 * @param {object} a @param {object} b — server party_members rows
 */
function pickSurvivorMember(a, b) {
    if (a.status !== 'active' && b.status === 'active') return b;
    if (b.status !== 'active' && a.status === 'active') return a;
    const aTime = new Date(a.joined_at).getTime();
    const bTime = new Date(b.joined_at).getTime();
    return aTime <= bTime ? a : b;
}

/**
 * Dedupe active member rows for API responses (same email/sub/token identity).
 * @param {object[]} members
 * @param {{ ownerEmail?: string | null }} [opts]
 */
export function dedupeServerMemberRows(members, opts = {}) {
    const ownerEmail = opts.ownerEmail ? String(opts.ownerEmail).toLowerCase() : '';
    const byKey = new Map();
    for (const m of members || []) {
        if (!isHumanPartyMember(m)) continue;
        const email = m.email ? String(m.email).toLowerCase() : '';
        if (ownerEmail && email === ownerEmail) {
            m._isOwnerEmail = true;
        }
        const key =
            memberIdentityKey({ email: m.email, googleSub: m.google_sub, memberId: m.member_id }) ||
            `row:${m.member_id}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, m);
            continue;
        }
        byKey.set(key, pickSurvivorMember(existing, m));
    }
    const list = Array.from(byKey.values());
    if (ownerEmail) {
        const owners = list.filter((m) => m.email && String(m.email).toLowerCase() === ownerEmail);
        if (owners.length > 1) {
            const survivor = owners.reduce((a, b) => pickSurvivorMember(a, b));
            return list.filter((m) => {
                if (!m.email || String(m.email).toLowerCase() !== ownerEmail) return true;
                return m.member_id === survivor.member_id;
            });
        }
    }
    return list;
}

async function reassignClaimsAndRemoveMembers(client, survivorId, loserIds) {
    if (!loserIds.length) return;
    await client.query(
        `UPDATE party_meal_ingredient_claims
         SET claimed_by_member_id = $1::uuid
         WHERE claimed_by_member_id = ANY($2::uuid[])`,
        [survivorId, loserIds]
    );
    await client.query(
        `UPDATE party_members
         SET status = 'removed',
             removed_at = now(),
             member_token_hash = NULL,
             identity_key = NULL
         WHERE member_id = ANY($1::uuid[])`,
        [loserIds]
    );
}

async function dedupeActiveGroups(client, groupSql) {
    const groups = await client.query(groupSql);
    for (const row of groups.rows) {
        const ids = row.member_ids;
        if (!ids || ids.length < 2) continue;
        const survivor = ids[0];
        const losers = ids.slice(1);
        await reassignClaimsAndRemoveMembers(client, survivor, losers);
    }
}

async function safeBackfillIdentityKeys(client) {
    await client.query(`
        UPDATE party_members pm
        SET identity_key = 'email:' || lower(trim(pm.email))
        WHERE pm.status = 'active'
          AND pm.email IS NOT NULL AND trim(pm.email) <> ''
          AND (pm.identity_key IS NULL OR pm.identity_key = '')
          AND NOT EXISTS (
            SELECT 1 FROM party_members o
            WHERE o.party_id = pm.party_id
              AND o.status = 'active'
              AND o.identity_key = 'email:' || lower(trim(pm.email))
              AND o.member_id <> pm.member_id
          )
    `);
    await client.query(`
        UPDATE party_members pm
        SET identity_key = 'sub:' || trim(pm.google_sub)
        WHERE pm.status = 'active'
          AND pm.google_sub IS NOT NULL AND trim(pm.google_sub) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM party_members o
            WHERE o.party_id = pm.party_id
              AND o.status = 'active'
              AND o.identity_key = 'sub:' || trim(pm.google_sub)
              AND o.member_id <> pm.member_id
          )
    `);
}

/**
 * Merge duplicate active members in Postgres (claims → survivor, losers marked removed).
 * Dedupes before assigning identity_key; safe for existing duplicate-key production data.
 * @param {import('pg').PoolClient | { query: Function }} client
 */
export async function mergeDuplicatePartyMembers(client) {
    await dedupeActiveGroups(
        client,
        `
        SELECT pm.party_id,
               lower(trim(pm.email)) AS norm_email,
               array_agg(
                   pm.member_id
                   ORDER BY
                     (CASE
                       WHEN lower(trim(pm.email)) = lower(trim(p.owner_email))
                        AND pm.google_sub IS NOT NULL AND pm.google_sub = p.owner_sub THEN 0
                       WHEN lower(trim(pm.email)) = lower(trim(p.owner_email)) THEN 1
                       ELSE 2
                     END),
                     pm.joined_at ASC
               ) AS member_ids
        FROM party_members pm
        JOIN parties p ON p.id = pm.party_id
        WHERE pm.status = 'active'
          AND pm.email IS NOT NULL AND trim(pm.email) <> ''
        GROUP BY pm.party_id, lower(trim(pm.email)), p.owner_email
        HAVING COUNT(*) > 1
    `
    );

    await dedupeActiveGroups(
        client,
        `
        SELECT pm.party_id,
               trim(pm.google_sub) AS norm_sub,
               array_agg(
                   pm.member_id
                   ORDER BY
                     (CASE WHEN pm.google_sub IS NOT NULL AND pm.google_sub = p.owner_sub THEN 0 ELSE 1 END),
                     pm.joined_at ASC
               ) AS member_ids
        FROM party_members pm
        JOIN parties p ON p.id = pm.party_id
        WHERE pm.status = 'active'
          AND pm.google_sub IS NOT NULL AND trim(pm.google_sub) <> ''
        GROUP BY pm.party_id, trim(pm.google_sub), p.owner_sub
        HAVING COUNT(*) > 1
    `
    );

    await dedupeActiveGroups(
        client,
        `
        SELECT party_id, identity_key,
               array_agg(member_id ORDER BY joined_at ASC) AS member_ids
        FROM party_members
        WHERE status = 'active' AND identity_key IS NOT NULL
        GROUP BY party_id, identity_key
        HAVING COUNT(*) > 1
    `
    );

    await safeBackfillIdentityKeys(client);
}

/**
 * Run dedupe inside a transaction; swallow unique-violation races (23505) after retry.
 * @param {import('pg').PoolClient | { query: Function }} client
 */
export async function mergeDuplicatePartyMembersSafe(client) {
    try {
        await mergeDuplicatePartyMembers(client);
    } catch (error) {
        if (error?.code !== '23505') throw error;
        await mergeDuplicatePartyMembers(client);
    }
}

/**
 * Upsert an active party member (rejoin / new browser).
 * @returns {Promise<string>} member_id uuid
 */
export async function upsertActivePartyMember(client, {
    partyId,
    displayName,
    email,
    googleSub,
    memberTokenHash,
}) {
    const identityKey = memberIdentityKey({ email, googleSub });
    if (identityKey) {
        const upserted = await client.query(
            `INSERT INTO party_members (party_id, display_name, email, google_sub, identity_key, status, member_token_hash)
             VALUES ($1::uuid, $2, $3, $4, $5, 'active', $6)
             ON CONFLICT (party_id, identity_key) WHERE (status = 'active' AND identity_key IS NOT NULL)
             DO UPDATE SET
                 display_name = EXCLUDED.display_name,
                 email = COALESCE(EXCLUDED.email, party_members.email),
                 google_sub = COALESCE(EXCLUDED.google_sub, party_members.google_sub),
                 member_token_hash = COALESCE(EXCLUDED.member_token_hash, party_members.member_token_hash),
                 status = 'active',
                 removed_at = NULL
             RETURNING member_id`,
            [partyId, displayName, email, googleSub || null, identityKey, memberTokenHash || null]
        );
        return upserted.rows[0].member_id;
    }
    const inserted = await client.query(
        `INSERT INTO party_members (party_id, display_name, email, google_sub, identity_key, status, member_token_hash)
         VALUES ($1::uuid, $2, $3, $4, NULL, 'active', $5)
         RETURNING member_id`,
        [partyId, displayName, email, googleSub || null, memberTokenHash || null]
    );
    return inserted.rows[0].member_id;
}
