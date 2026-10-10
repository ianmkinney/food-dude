import { applyCors } from '../lib/cors.js';
import { isEmailAllowed, isOwnerGateConfigured, requireSecrets, resolveOpenRouterApiKey } from '../lib/env.js';
import { bearerToken, verifySession } from '../lib/session.js';
import { checkMinuteRateLimit } from '../lib/store.js';
import { assertHttpOrHttpsUrl, safeFetchHtml } from '../lib/ssrf.js';
import { extractRecipeFromHtml, hasRecipeShape } from '../lib/recipeExtract.js';
import { importInstagramPost, isInstagramPostUrl } from '../lib/instagramImport.js';
import { importTikTokPost, isTikTokPostUrl } from '../lib/tiktokImport.js';
import { isStructuredImportPayload, jsonFromSocialImport, mapSocialImportError } from '../lib/socialImportRespond.js';
import { runVideoRecipeExtraction, validateUploadedVideo } from '../lib/importVideoShared.js';

const HEAVY_RL_PER_MINUTE = 3;

const MSG = {
    method_not_allowed: 'Method not allowed.',
    platform_disabled: 'Owner sign-in is not enabled on this server.',
    misconfigured: 'Server configuration error.',
    unauthorized: 'Sign in again in Account.',
    not_allowed: 'This Google account is not authorized.',
    no_platform_key: 'No platform AI key is configured for this account.',
    rate_limited: 'Too many import requests. Wait a moment and try again.',
    bad_request: 'Invalid request.',
    site_blocked: "That site couldn't be reached from AmpliFood's server (blocked or unavailable). Paste the recipe text or upload a screenshot instead.",
    no_recipe_found: "No recipe was found on that page. Paste the recipe text or upload a screenshot instead.",
    instagram_login_wall:
        "Instagram didn't share the caption (login required). Paste the caption text below or upload a screenshot or screen recording of the post.",
    instagram_no_caption:
        "Couldn't read an Instagram caption from that link. Paste the caption or upload a screenshot or screen recording of the post.",
    tiktok_no_caption:
        "Couldn't read a TikTok description from that link. Paste the caption or upload a screen recording of the video.",
    video_too_large: 'That video is too large (max 25 MB). Trim the clip or upload a shorter screen recording.',
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

async function handleSocialImport(res, platform, inputUrl, session) {
    const apiKey = resolveOpenRouterApiKey(session.email);
    const importer = platform === 'tiktok' ? importTikTokPost : importInstagramPost;
    try {
        const result = await importer(inputUrl, {
            apiKey,
            onHeavyRateLimit: () => checkMinuteRateLimit(`import-heavy:${session.sub}`, HEAVY_RL_PER_MINUTE),
        });
        const { status, body } = jsonFromSocialImport(result, platform);
        res.status(status).json(body);
    } catch (error) {
        const code = error?.message || `${platform}_no_caption`;
        const mapped = mapSocialImportError(code, platform);
        reject(res, mapped.status, mapped.error);
    }
}

async function handleVideoUpload(req, res, session) {
    const apiKey = resolveOpenRouterApiKey(session.email);
    if (!apiKey) {
        reject(res, 403, 'no_platform_key');
        return;
    }
    if (!checkMinuteRateLimit(`import-heavy:${session.sub}`, HEAVY_RL_PER_MINUTE)) {
        reject(res, 429, 'rate_limited');
        return;
    }
    let video;
    try {
        video = validateUploadedVideo(req.body?.video);
    } catch (error) {
        if (error?.message === 'video_too_large' || error?.code === 'video_too_large') {
            reject(res, 413, 'video_too_large');
            return;
        }
        reject(res, 400, 'bad_request');
        return;
    }
    const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl : null;
    const author = typeof req.body?.author === 'string' ? req.body.author : null;
    const sourcePlatform = typeof req.body?.sourcePlatform === 'string' ? req.body.sourcePlatform : 'video';
    const note = typeof req.body?.note === 'string' ? req.body.note : '';

    try {
        const payload = await runVideoRecipeExtraction({
            apiKey,
            mimeType: video.mimeType,
            base64: video.base64,
            extraContext: note,
            meta: { sourceUrl, sourcePlatform, author },
        });
        res.status(200).json(payload);
    } catch (error) {
        console.error('[recipes/import] video upload extract failed:', error?.message || error);
        reject(res, 422, 'no_recipe_found');
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

    if (!checkMinuteRateLimit(`import:${session.sub}`)) {
        reject(res, 429, 'rate_limited');
        return;
    }

    if (req.body?.video) {
        await handleVideoUpload(req, res, session);
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

    if (isTikTokPostUrl(url)) {
        await handleSocialImport(res, 'tiktok', url, session);
        return;
    }

    if (isInstagramPostUrl(url)) {
        await handleSocialImport(res, 'instagram', url, session);
        return;
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
