import { applyCors } from '../lib/cors.js';
import { isEmailAllowed, isOwnerGateConfigured, requireSecrets } from '../lib/env.js';
import { bearerToken, verifySession } from '../lib/session.js';
import { checkMinuteRateLimit } from '../lib/store.js';
import { assertHttpOrHttpsUrl, safeFetchHtml } from '../lib/ssrf.js';
import { extractRecipeFromHtml, hasRecipeShape } from '../lib/recipeExtract.js';
import { importInstagramPost, isInstagramPostUrl } from '../lib/instagramImport.js';

const MSG = {
    method_not_allowed: 'Method not allowed.',
    platform_disabled: 'Owner sign-in is not enabled on this server.',
    misconfigured: 'Server configuration error.',
    unauthorized: 'Sign in again in Account.',
    not_allowed: 'This Google account is not authorized.',
    rate_limited: 'Too many import requests. Wait a moment and try again.',
    bad_request: 'Invalid request.',
    site_blocked: "That site couldn't be reached from AmpliFood's server (blocked or unavailable). Paste the recipe text or upload a screenshot instead.",
    no_recipe_found: "No recipe was found on that page. Paste the recipe text or upload a screenshot instead.",
    instagram_login_wall:
        "Instagram didn't share the caption (login required). Paste the caption text below or upload a screenshot of the post.",
    instagram_no_caption:
        "Couldn't read an Instagram caption from that link. Paste the caption or upload a screenshot of the post.",
};

function reject(res, status, error, extra = {}) {
    console.warn(`[recipes/import] ${status} ${error}`);
    res.status(status).json({ error, message: MSG[error] || 'Request failed.', ...extra });
}

function mapFetchError(code) {
    if (code === 'blocked_host' || code === 'blocked_ip' || code === 'invalid_protocol' || code === 'non_standard_port') {
        return 'site_blocked';
    }
    if (code === 'timeout' || code === 'fetch_failed' || code === 'too_many_redirects' || code === 'response_too_large') {
        return 'site_blocked';
    }
    return 'site_blocked';
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
        assertHttpOrHttpsUrl(url);
    } catch {
        reject(res, 400, 'bad_request');
        return;
    }

    if (!checkMinuteRateLimit(`import:${session.sub}`)) {
        reject(res, 429, 'rate_limited');
        return;
    }

    if (isInstagramPostUrl(url)) {
        try {
            const ig = await importInstagramPost(url);
            res.status(200).json({
                text: ig.text,
                image: ig.image,
                sourceUrl: ig.sourceUrl,
                sourcePlatform: 'instagram',
                author: ig.author,
            });
            return;
        } catch (error) {
            const code = error?.message || 'instagram_no_caption';
            if (code === 'instagram_login_wall') {
                reject(res, 422, 'instagram_login_wall');
                return;
            }
            if (code === 'invalid_instagram_url') {
                reject(res, 400, 'bad_request');
                return;
            }
            reject(res, 404, 'instagram_no_caption');
            return;
        }
    }

    let fetched;
    try {
        fetched = await safeFetchHtml(url);
    } catch (error) {
        const code = error?.message || 'fetch_failed';
        reject(res, 422, mapFetchError(code));
        return;
    }

    const { structured, text, hintTitle } = extractRecipeFromHtml(fetched.html);
    const sourceUrl = fetched.finalUrl;

    if (hasRecipeShape(structured)) {
        res.status(200).json({
            title: structured.title,
            ingredients: structured.ingredients,
            steps: structured.steps,
            servings: structured.servings,
            times: structured.times,
            image: structured.image || null,
            sourceUrl,
        });
        return;
    }

    const readable = (text || '').trim();
    if (!readable || readable.length < 80) {
        reject(res, 404, 'no_recipe_found');
        return;
    }

    res.status(200).json({
        sourceUrl,
        text: readable,
        ...(hintTitle ? { title: hintTitle } : null),
    });
}
