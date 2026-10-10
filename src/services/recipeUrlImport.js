import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';

const IMPORT_ERRORS = {
    unauthorized: 'Sign in with Owner in Account to import recipe links on the web, or paste the recipe text / upload a screenshot.',
    not_allowed: 'This Google account is not authorized for link import on the web. Paste the recipe text or upload a screenshot instead.',
    platform_disabled: 'Link import is not available on this server yet. Paste the recipe text or upload a screenshot.',
    site_blocked:
        "That site couldn't be loaded from AmpliFood's server. Paste the recipe text or upload a screenshot or PDF instead.",
    no_recipe_found:
        "No recipe was found on that page. Paste the recipe text or upload a screenshot or PDF instead.",
    rate_limited: 'Too many import attempts. Wait a moment and try again.',
};

function hostnameFromUrl(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return 'recipe site';
    }
}

function mapStructuredPayload(payload, fallbackUrl) {
    const sourceUrl = payload.sourceUrl || fallbackUrl;
    const ingredients = (payload.ingredients || []).map((line) => ({
        ingredient: String(line),
        quantity: null,
        unit: null,
        section: null,
    }));
    return {
        title: payload.title || 'Imported recipe',
        description: null,
        servings: payload.servings ?? null,
        prepTime: payload.times?.prepMinutes ?? null,
        cookTime: payload.times?.cookMinutes ?? null,
        totalTime: payload.times?.totalMinutes ?? null,
        ingredients,
        instructions: Array.isArray(payload.steps) ? payload.steps.map(String) : [],
        tags: [],
        imageUri: null,
        sourceUrl,
        sourcePlatform: hostnameFromUrl(sourceUrl),
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
    if (Platform.OS !== 'web') {
        return { kind: 'error', message: 'Server import is only used on web.', code: 'not_web' };
    }
    const result = await postRecipeImport(url);
    if (!result.ok) {
        return { kind: 'error', message: result.message, code: result.error };
    }
    const payload = result.body;
    if (payload?.ingredients?.length || payload?.steps?.length) {
        return { kind: 'structured', recipe: mapStructuredPayload(payload, url) };
    }
    if (payload?.text) {
        return { kind: 'text', text: payload.text, sourceUrl: payload.sourceUrl || url };
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
