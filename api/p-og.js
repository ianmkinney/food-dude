import { getPartySql, isPartyDatabaseConfigured } from './_lib/partyDb.js';
import { isInviteRowValid } from './_lib/partyInvite.js';
import { renderPartyOgPng } from './_lib/partyOgRender.js';

export const config = {
    runtime: 'nodejs',
};

function requestOrigin(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'amplifood.vercel.app';
    return `${proto}://${host}`;
}

async function loadPartyOgContext(token) {
    const fallback = { title: 'AmpliFood Party' };
    if (!token || !isPartyDatabaseConfigured()) {
        return fallback;
    }
    try {
        const sql = await getPartySql();
        const rows = await sql`
            SELECT p.id, p.name, p.image_url, p.image_bytea IS NOT NULL AS has_bytea,
                   it.revoked, it.expires_at
            FROM invite_tokens it
            JOIN parties p ON p.id = it.party_id
            WHERE it.token = ${token}
            LIMIT 1`;
        const row = rows[0];
        if (!isInviteRowValid(row)) {
            return fallback;
        }
        return {
            title: row.name || fallback.title,
            partyId: row.id,
            imageUrl: row.image_url,
            hasBytea: Boolean(row.has_bytea),
        };
    } catch (error) {
        console.warn('[p-og] lookup failed', error?.message || error);
        return fallback;
    }
}

function resolveBackgroundUrl(req, ctx) {
    if (ctx.imageUrl) return ctx.imageUrl;
    if (ctx.partyId && ctx.hasBytea) {
        const origin = requestOrigin(req);
        return `${origin}/api/party?action=image&partyId=${encodeURIComponent(ctx.partyId)}`;
    }
    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.status(405).send('Method not allowed');
        return;
    }
    const token = String(req.query?.token || '').trim();
    try {
        const ctx = await loadPartyOgContext(token);
        const backgroundImageUrl = resolveBackgroundUrl(req, ctx);
        const png = await renderPartyOgPng({
            title: ctx.title,
            backgroundImageUrl,
        });
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.status(200).send(png);
    } catch (error) {
        console.error('[p-og]', error);
        res.status(500).send('Could not render image');
    }
}
