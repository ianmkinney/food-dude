import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';

export function isTikTokPostUrl(url) {
    try {
        const parsed = new URL(String(url).trim());
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return true;
        if (!host.endsWith('tiktok.com')) return false;
        return /\/@[^/]+\/video\/\d+/i.test(parsed.pathname) || /\/video\/\d+/i.test(parsed.pathname) || /\/t\/\w+/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

export function isSocialPostUrl(url) {
    return isInstagramPostUrl(url) || isTikTokPostUrl(url);
}

export function isInstagramPostUrl(url) {
    try {
        const parsed = new URL(String(url).trim());
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        if (host !== 'instagram.com' && host !== 'm.instagram.com') return false;
        return /\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/.test(parsed.pathname);
    } catch {
        return false;
    }
}

const IMPORT_ERRORS = {
    unauthorized: 'Sign in with Owner in Account to import recipe links on the web, or paste the recipe text / upload a screenshot.',
    not_allowed: 'This Google account is not authorized for link import on the web. Paste the recipe text or upload a screenshot instead.',
    platform_disabled: 'Link import is not available on this server yet. Paste the recipe text or upload a screenshot.',
    site_blocked:
        "That site couldn't be loaded from AmpliFood's server. Paste the recipe text or upload a screenshot or PDF instead.",
    no_recipe_found:
        "No recipe was found on that page. Paste the recipe text or upload a screenshot or PDF instead.",
    instagram_login_wall:
        "Instagram didn't share the caption (login required). Paste the caption below or upload a screenshot of the post.",
    instagram_no_caption:
        "Couldn't read an Instagram caption from that link. Paste the caption or upload a screenshot of the post.",
    tiktok_no_caption:
        "Couldn't read a TikTok description from that link. Paste the caption or upload a screen recording of the video.",
    rate_limited: 'Too many import attempts. Wait a moment and try again.',
};

export function instagramImportFallbackHint() {
    return ' Paste the caption text below, or upload a screenshot of the post.';
}

export function socialImportFallbackHint(url) {
    if (isTikTokPostUrl(url)) {
        return ' Paste the caption below, or attach a screen recording in Ampi chat.';
    }
    return instagramImportFallbackHint();
}

function tiktokPlatformLabel(author) {
    const handle = author ? String(author).replace(/^@/, '') : null;
    return handle ? `TikTok · @${handle}` : 'TikTok';
}

function hostnameFromUrl(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return 'recipe site';
    }
}

function instagramPlatformLabel(sourceUrl, author) {
    const handle = author ? String(author).replace(/^@/, '') : null;
    return handle ? `Instagram · @${handle}` : 'Instagram';
}

function mapStructuredPayload(payload, fallbackUrl) {
    const sourceUrl = payload.sourceUrl || fallbackUrl;
    const ingredients = (payload.ingredients || []).map((line) => ({
        ingredient: String(line),
        quantity: null,
        unit: null,
        section: null,
    }));
    let platform = hostnameFromUrl(sourceUrl);
    if (payload.sourcePlatform === 'instagram') {
        platform = instagramPlatformLabel(sourceUrl, payload.author);
    } else if (payload.sourcePlatform === 'tiktok') {
        platform = tiktokPlatformLabel(payload.author);
    }
    return {
        title: payload.title || 'Imported recipe',
        description: payload.description || null,
        servings: payload.servings ?? null,
        prepTime: payload.times?.prepMinutes ?? null,
        cookTime: payload.times?.cookMinutes ?? null,
        totalTime: payload.times?.totalMinutes ?? null,
        ingredients,
        instructions: Array.isArray(payload.steps) ? payload.steps.map(String) : [],
        tags: [],
        imageUri: null,
        sourceUrl,
        sourcePlatform: platform,
        aiExtracted: Boolean(payload.aiExtracted),
    };
}

async function postRecipeImport(url) {
    const token = await getOwnerSessionToken();
    if (!token) {
        return {
            ok: false,
            status: 401,
            error: 'unauthorized',
            message: IMPORT_ERRORS.unauthorized,
        };
    }
    const endpoint = `${getApiBaseUrl()}/recipes/import`;
    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });
    } catch (error) {
        return {
            ok: false,
            status: 0,
            error: 'network',
            message: error?.message || 'Load failed',
        };
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const code = body?.error || 'request_failed';
        return {
            ok: false,
            status: response.status,
            error: code,
            message: body?.message || IMPORT_ERRORS[code] || "Couldn't import that link.",
        };
    }
    return { ok: true, body };
}

/**
 * Web-only: fetch a recipe URL through AmpliFood's server (avoids browser CORS).
 * @returns {Promise<{ kind: 'structured', recipe: object } | { kind: 'text', text: string, sourceUrl: string } | { kind: 'error', message: string, code?: string }>}
 */
export async function fetchRecipeImportViaApi(url) {
    const useServer = Platform.OS === 'web' || isSocialPostUrl(url);
    if (!useServer) {
        return { kind: 'error', message: 'Server import is only used on web.', code: 'not_web' };
    }
    const result = await postRecipeImport(url);
    if (!result.ok) {
        return { kind: 'error', message: result.message, code: result.error };
    }
    const payload = result.body;
    if (payload?.ingredients?.length || payload?.steps?.length) {
        return {
            kind: 'structured',
            recipe: mapStructuredPayload(payload, url),
            aiExtracted: Boolean(payload.aiExtracted),
        };
    }
    if (payload?.text) {
        return {
            kind: 'text',
            text: payload.text,
            sourceUrl: payload.sourceUrl || url,
            sourcePlatform: payload.sourcePlatform,
            author: payload.author,
        };
    }
    return {
        kind: 'error',
        message: IMPORT_ERRORS.no_recipe_found,
        code: 'no_recipe_found',
    };
}

export function isWebRecipeUrlImportError(message) {
    if (!message) return false;
    return Object.values(IMPORT_ERRORS).some((line) => message.includes(line.slice(0, 24)));
}
