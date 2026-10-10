import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';

export const IMPORT_URL_FALLBACK_HINT =
    'Try pasting the recipe text, or share a screenshot or PDF from the share sheet.';

const ERROR_MESSAGES = {
    unauthorized: 'Sign in under Account to import recipe links on the web.',
    not_allowed: 'This Google account is not authorized for link import.',
    site_blocked: "That site couldn't be reached or blocked the import.",
    no_recipe_found: "Couldn't find a recipe on that page.",
    rate_limited: 'Too many import attempts. Wait a minute and try again.',
    platform_disabled: 'Link import is not available on this server yet.',
};

/**
 * @param {string} code
 * @param {string} [serverMessage]
 */
export function recipeImportErrorMessage(code, serverMessage) {
    const base = ERROR_MESSAGES[code] || serverMessage || 'Recipe import failed.';
    if (code === 'site_blocked' || code === 'no_recipe_found' || code === 'fetch_failed') {
        return `${base} ${IMPORT_URL_FALLBACK_HINT}`;
    }
    return base;
}

/**
 * Server-side recipe URL fetch (web only). Returns structured recipe or text for AI parsing.
 * @param {string} url
 */
export async function fetchRecipeImportFromServer(url) {
    const token = await getOwnerSessionToken();
    if (!token) {
        return {
            ok: false,
            error: recipeImportErrorMessage('unauthorized'),
            code: 'unauthorized',
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
            error: recipeImportErrorMessage('site_blocked', error?.message),
            code: 'site_blocked',
        };
    }

    const raw = await response.text().catch(() => '');
    let body = {};
    try {
        body = raw ? JSON.parse(raw) : {};
    } catch {
        body = {};
    }

    if (!response.ok) {
        const code = body?.error || 'site_blocked';
        return {
            ok: false,
            error: recipeImportErrorMessage(code, body?.message),
            code,
        };
    }

    return { ok: true, body };
}

/**
 * @param {object} serverRecipe
 * @param {string} sourceUrl
 */
export function mapServerRecipeToClient(serverRecipe, sourceUrl) {
    const hostname = (() => {
        try {
            return new URL(sourceUrl).hostname.replace(/^www\./, '');
        } catch {
            return null;
        }
    })();

    const times = serverRecipe.times || {};
    const ingredients = (serverRecipe.ingredients || []).map((line) => ({
        ingredient: String(line),
        quantity: null,
        unit: null,
        section: null,
    }));

    return {
        title: serverRecipe.title || 'Imported recipe',
        description: null,
        servings: serverRecipe.servings ?? null,
        prepTime: times.prepMinutes ?? null,
        cookTime: times.cookMinutes ?? null,
        totalTime: times.totalMinutes ?? null,
        ingredients,
        instructions: serverRecipe.steps || [],
        tags: [],
        imageUri: null,
        sourceUrl,
        sourcePlatform: hostname,
    };
}

export function shouldUseRecipeImportProxy() {
    return Platform.OS === 'web';
}
