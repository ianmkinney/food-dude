import { applyCors } from '../_lib/cors.js';
import { isEmailAllowed, isOwnerGateConfigured, requireSecrets } from '../_lib/env.js';
import { bearerToken, verifySession } from '../_lib/session.js';
import { checkMinuteRateLimit } from '../_lib/store.js';

const RESEND_URL = 'https://api.resend.com/emails';
const MAX_RECIPIENTS = 20;
const MAX_LINK_CHARS = 8 * 1024;

const MSG = {
    method_not_allowed: 'Method not allowed.',
    platform_disabled: 'Party email is not enabled.',
    misconfigured: 'Server configuration error.',
    unauthorized: 'Sign in again in Account.',
    not_allowed: 'This Google account is not authorized.',
    rate_limited: 'Too many requests. Wait a moment and try again.',
    bad_request: 'Invalid request.',
    upstream_failed: 'Email could not be sent. Try again later.',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function reject(res, status, error) {
    console.warn(`[party/email] ${status} ${error}`);
    res.status(status).json({ error, message: MSG[error] || 'Request failed.' });
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function validateMembers(members) {
    if (!Array.isArray(members)) return [];
    return members
        .map((m) => ({
            email: normalizeEmail(m?.email),
            name: m?.name ? String(m.name).slice(0, 120) : '',
        }))
        .filter((m) => m.email && EMAIL_RE.test(m.email));
}

function buildHtml({ partyName, actorName, shareLink, intro }) {
    return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5">
<p>${intro}</p>
<p><a href="${shareLink}">Open party in AmpliFood</a></p>
<p style="color:#555;font-size:14px">Party updates travel by email; nothing is stored on our servers.</p>
<p>— ${actorName}</p>
</body></html>`;
}

function templateForKind(kind, { partyName, actorName, shareLink, version }) {
    switch (kind) {
        case 'invite':
            return {
                subject: `Join my party "${partyName}" on AmpliFood`,
                text: `${actorName} invited you to join "${partyName}" on AmpliFood.\n\nOpen: ${shareLink}\n\nParty updates travel by email; nothing is stored on our servers.`,
                html: buildHtml({
                    partyName,
                    actorName,
                    shareLink,
                    intro: `${actorName} invited you to join <strong>${partyName}</strong> on AmpliFood.`,
                }),
            };
        case 'member_update':
            return {
                subject: `Suggested changes for "${partyName}"`,
                text: `${actorName} suggested changes for "${partyName}".\n\nReview: ${shareLink}`,
                html: buildHtml({
                    partyName,
                    actorName,
                    shareLink,
                    intro: `${actorName} suggested changes for <strong>${partyName}</strong>.`,
                }),
            };
        case 'broadcast':
            return {
                subject: `Updated party "${partyName}" (v${version})`,
                text: `${actorName} shared version ${version} of "${partyName}".\n\nOpen: ${shareLink}`,
                html: buildHtml({
                    partyName,
                    actorName,
                    shareLink,
                    intro: `${actorName} shared <strong>version ${version}</strong> of <strong>${partyName}</strong>.`,
                }),
            };
        default:
            return null;
    }
}

export default async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
        reject(res, 405, 'method_not_allowed');
        return;
    }

    if (!isOwnerGateConfigured()) {
        reject(res, 503, 'platform_disabled');
        return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !String(apiKey).trim()) {
        reject(res, 503, 'misconfigured');
        return;
    }

    try {
        requireSecrets();
    } catch (error) {
        console.error('[party/email] secrets:', error?.message || error);
        reject(res, 503, 'misconfigured');
        return;
    }

    const token = bearerToken(req);
    if (!token) {
        reject(res, 401, 'unauthorized');
        return;
    }

    let session;
    try {
        session = await verifySession(token);
    } catch {
        reject(res, 401, 'unauthorized');
        return;
    }

    if (!isEmailAllowed(session.email)) {
        reject(res, 403, 'not_allowed');
        return;
    }

    if (!checkMinuteRateLimit(`party:${session.sub}`)) {
        reject(res, 429, 'rate_limited');
        return;
    }

    const body = req.body || {};
    const kind = body.kind;
    const shareLink = String(body.shareLink || '');
    const partyName = String(body.partyName || 'Party').slice(0, 200);
    const actorName = String(body.actorName || session.name || session.email || 'A friend').slice(0, 120);
    const partyMembers = validateMembers(body.partyMembers);
    const memberEmails = new Set(partyMembers.map((m) => m.email));

    let recipients = Array.isArray(body.to) ? body.to.map(normalizeEmail) : [];
    recipients = recipients.filter((e) => EMAIL_RE.test(e));
    recipients = [...new Set(recipients)];

    if (!kind || !shareLink || !recipients.length) {
        reject(res, 400, 'bad_request');
        return;
    }
    if (recipients.length > MAX_RECIPIENTS) {
        reject(res, 400, 'bad_request');
        return;
    }
    if (shareLink.length > MAX_LINK_CHARS) {
        reject(res, 400, 'bad_request');
        return;
    }
    if (!memberEmails.size) {
        reject(res, 400, 'bad_request');
        return;
    }
    for (const email of recipients) {
        if (!memberEmails.has(email)) {
            reject(res, 400, 'bad_request');
            return;
        }
    }

    const tpl = templateForKind(kind, {
        partyName,
        actorName,
        shareLink,
        version: body.version,
    });
    if (!tpl) {
        reject(res, 400, 'bad_request');
        return;
    }

    const from = process.env.RESEND_FROM || 'onboarding@resend.dev';

    try {
        const response = await fetch(RESEND_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from,
                to: recipients,
                subject: tpl.subject,
                text: tpl.text,
                html: tpl.html,
            }),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            console.error('[party/email] resend failed:', response.status, text.slice(0, 300));
            reject(res, 502, 'upstream_failed');
            return;
        }
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('[party/email] resend error:', error?.message || error);
        reject(res, 502, 'upstream_failed');
    }
}
