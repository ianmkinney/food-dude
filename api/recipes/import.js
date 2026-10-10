import { applyCors } from '../lib/cors.js';
import { isEmailAllowed, isOwnerGateConfigured, requireSecrets } from '../lib/env.js';
import { extractRecipeFromHtml } from '../lib/recipeExtract.js';
import { SafeFetchError, fetchHtmlSafe } from '../lib/safeFetch.js';
import { parseHttpUrl } from '../lib/ssrf.js';
import { bearerToken, verifySession } from '../lib/session.js';
import { checkMinuteRateLimit } from '../lib/store.js';

const MSG = {
    method_not_allowed: 'Method not allowed.',
    platform_disabled: 'Owner platform AI is not enabled.',
    misconfigured: 'Server configuration error.',
    unauthorized: 'Sign in again in Account.',
    not_allowed: 'This Google account is not authorized.',
    rate_limited: 'Too many requests. Wait a moment and try again.',
    bad_request: 'Invalid request.',
    site_blocked: "That site couldn't be reached or blocked the import.",
    no_recipe_found: "Couldn't find a recipe on that page.",
};

function reject(res, status, error, extra = {}) {
    console.warn(`[recipes/import] ${status} ${error}`);
    res.status(status).json({ error, message: MSG[error] || 'Request failed.', ...extra });
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

    try {
        requireSecrets();
    } catch (error) {
        console.error('[recipes/import] secrets:', error?.message || error);
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

    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
        reject(res, 400, 'bad_request');
        return;
    }

    try {
        parseHttpUrl(url);
    } catch {
        reject(res, 400, 'bad_request');
        return;
    }

    if (!checkMinuteRateLimit(`recipe-import:${session.sub}`)) {
        reject(res, 429, 'rate_limited');
        return;
    }

    try {
        const { html, finalUrl } = await fetchHtmlSafe(url);
        const extracted = extractRecipeFromHtml(html, finalUrl);

        if (extracted.mode === 'structured' && extracted.recipe) {
            res.status(200).json({
                mode: 'structured',
                recipe: extracted.recipe,
            });
            return;
        }

        if (extracted.mode === 'text' && extracted.text) {
            res.status(200).json({
                mode: 'text',
                text: extracted.text,
                sourceUrl: extracted.sourceUrl || finalUrl,
                titleHint: extracted.hintTitle || null,
                image: extracted.image || null,
            });
            return;
        }

        reject(res, 404, 'no_recipe_found');
    } catch (error) {
        if (error instanceof SafeFetchError) {
            if (error.code === 'site_blocked' || error.code === 'timeout' || error.code === 'not_html') {
                reject(res, 502, 'site_blocked');
                return;
            }
            if (error.code === 'response_too_large') {
                reject(res, 413, 'site_blocked', { message: 'That page is too large to import.' });
                return;
            }
            reject(res, 502, 'site_blocked');
            return;
        }
        console.error('[recipes/import] failed:', error?.message || error);
        reject(res, 502, 'site_blocked');
    }
}
