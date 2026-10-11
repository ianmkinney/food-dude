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

/**
 * Merge duplicate active members in Postgres (claims → survivor, losers marked removed).
 * @param {import('pg').PoolClient | { query: Function }} client
 */
export async function mergeDuplicatePartyMembers(client) {
    await client.query(`
        UPDATE party_members
        SET identity_key = 'email:' || lower(trim(email))
        WHERE email IS NOT NULL AND trim(email) <> '' AND (identity_key IS NULL OR identity_key = '')
    `);
    await client.query(`
        UPDATE party_members
        SET identity_key = 'sub:' || trim(google_sub)
        WHERE google_sub IS NOT NULL AND trim(google_sub) <> ''
    `);

    const dups = await client.query(`
        SELECT party_id, identity_key,
               array_agg(member_id ORDER BY joined_at ASC) AS member_ids
        FROM party_members
        WHERE status = 'active' AND identity_key IS NOT NULL
        GROUP BY party_id, identity_key
        HAVING COUNT(*) > 1
    `);

    for (const row of dups.rows) {
        const ids = row.member_ids;
        const survivor = ids[0];
        const losers = ids.slice(1);
        if (!losers.length) continue;
        await client.query(
            `UPDATE party_meal_ingredient_claims
             SET claimed_by_member_id = $1::uuid
             WHERE claimed_by_member_id = ANY($2::uuid[])`,
            [survivor, losers]
        );
        await client.query(
            `UPDATE party_members
             SET status = 'removed', removed_at = now(), member_token_hash = NULL
             WHERE member_id = ANY($1::uuid[])`,
            [losers]
        );
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
        const existing = await client.query(
            `SELECT member_id FROM party_members
             WHERE party_id = $1::uuid AND identity_key = $2 AND status = 'active'
             LIMIT 1`,
            [partyId, identityKey]
        );
        if (existing.rows[0]) {
            const memberId = existing.rows[0].member_id;
            await client.query(
                `UPDATE party_members
                 SET display_name = $1,
                     email = COALESCE($2, email),
                     google_sub = COALESCE($3, google_sub),
                     member_token_hash = COALESCE($4, member_token_hash),
                     identity_key = $5
                 WHERE member_id = $6::uuid`,
                [displayName, email, googleSub, memberTokenHash, identityKey, memberId]
            );
            return memberId;
        }
    }
    const inserted = await client.query(
        `INSERT INTO party_members (party_id, display_name, email, google_sub, identity_key, status, member_token_hash)
         VALUES ($1::uuid, $2, $3, $4, $5, 'active', $6)
         RETURNING member_id`,
        [partyId, displayName, email, googleSub || null, identityKey, memberTokenHash || null]
    );
    return inserted.rows[0].member_id;
}
