import { generateToken } from './partyTokens.js';
import { INVITE_TTL_DAYS } from './partyConstants.js';

export function isInviteRowValid(row) {
    if (!row || row.revoked) return false;
    if (row.expires_at) {
        const exp = new Date(row.expires_at).getTime();
        if (Number.isFinite(exp) && exp <= Date.now()) return false;
    }
    return true;
}

/**
 * Revoke active invites and mint a new token (transaction client).
 * @param {import('pg').PoolClient} client
 * @param {string} partyId
 */
export async function rotateInviteToken(client, partyId) {
    const newToken = generateToken(24);
    await client.query(
        `UPDATE invite_tokens SET revoked = true
         WHERE party_id = $1::uuid AND revoked = false`,
        [partyId]
    );
    await client.query(
        `INSERT INTO invite_tokens (token, party_id, revoked, expires_at)
         VALUES ($1, $2::uuid, false, now() + ($3::text || ' days')::interval)`,
        [newToken, partyId, String(INVITE_TTL_DAYS)]
    );
    return newToken;
}

export async function insertInviteToken(client, partyId, token) {
    await client.query(
        `INSERT INTO invite_tokens (token, party_id, revoked, expires_at)
         VALUES ($1, $2::uuid, false, now() + ($3::text || ' days')::interval)`,
        [token, partyId, String(INVITE_TTL_DAYS)]
    );
}
