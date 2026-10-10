import { getPartySql, isPartyDatabaseConfigured } from './_lib/partyDb.js';

const SITE = 'https://amplifood.vercel.app';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.status(405).send('Method not allowed');
        return;
    }
    const token = String(req.query?.token || '').trim();
    if (!token || token.length < 20) {
        res.status(400).send('Invalid invite link');
        return;
    }
    if (!isPartyDatabaseConfigured()) {
        res.status(503).send('Party sync is not configured.');
        return;
    }
    try {
        const sql = await getPartySql();
        const invites = await sql`
            SELECT it.party_id, it.revoked, p.name, p.image_url
            FROM invite_tokens it
            JOIN parties p ON p.id = it.party_id
            WHERE it.token = ${token}
            LIMIT 1`;
        const row = invites[0];
        if (!row || row.revoked) {
            res.status(404).send('Invite not found');
            return;
        }
        const partyName = row.name || 'AmpliFood party';
        const description = `Join ${partyName} on AmpliFood`;
        const ogImage =
            row.image_url ||
            `${SITE}/api/p-og?token=${encodeURIComponent(token)}`;
        const joinUrl = `${SITE}/party?inviteToken=${encodeURIComponent(token)}`;
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(partyName)} · AmpliFood</title>
<meta name="description" content="${escapeHtml(description)}"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${escapeHtml(partyName)}"/>
<meta property="og:description" content="${escapeHtml(description)}"/>
<meta property="og:image" content="${escapeHtml(ogImage)}"/>
<meta property="og:url" content="${SITE}/p/${escapeHtml(token)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapeHtml(partyName)}"/>
<meta name="twitter:description" content="${escapeHtml(description)}"/>
<meta name="twitter:image" content="${escapeHtml(ogImage)}"/>
<meta http-equiv="refresh" content="0;url=${escapeHtml(joinUrl)}"/>
</head>
<body>
<p>Opening AmpliFood… <a href="${escapeHtml(joinUrl)}">Join ${escapeHtml(partyName)}</a></p>
<script>location.replace(${JSON.stringify(joinUrl)});</script>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.status(200).send(html);
    } catch (error) {
        console.error('[p preview]', error);
        res.status(500).send('Could not load invite');
    }
}
