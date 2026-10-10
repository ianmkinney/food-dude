import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';
import { prepareVideoForAi } from './mediaPrep';

export const MAX_RECIPE_VIDEO_BYTES = 25 * 1024 * 1024;

function sourcePlatformLabel({ sourceUrl, sourcePlatform, author }) {
    if (sourcePlatform === 'instagram') {
        const handle = author ? String(author).replace(/^@/, '') : null;
        return handle ? `Instagram · @${handle}` : 'Instagram';
    }
    if (sourcePlatform === 'tiktok') {
        const handle = author ? String(author).replace(/^@/, '') : null;
        return handle ? `TikTok · @${handle}` : 'TikTok';
    }
    if (sourcePlatform) return sourcePlatform;
    try {
        return new URL(sourceUrl).hostname.replace(/^www\./, '');
    } catch {
        return 'video';
    }
}

function mapStructuredPayload(payload, fallbackUrl) {
    const sourceUrl = payload.sourceUrl || fallbackUrl || null;
    const ingredients = (payload.ingredients || []).map((line) => ({
        ingredient: String(line),
        quantity: null,
        unit: null,
        section: null,
    }));
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
        sourcePlatform: sourcePlatformLabel({
            sourceUrl,
            sourcePlatform: payload.sourcePlatform,
            author: payload.author,
        }),
        aiExtracted: Boolean(payload.aiExtracted),
    };
}

async function postImport(body) {
    const token = await getOwnerSessionToken();
    if (!token) {
        return {
            ok: false,
            status: 401,
            error: 'unauthorized',
            message: 'Sign in with Owner in Account to import from video, or add your own Gemini key.',
        };
    }
    let res;
    try {
        res = await fetch(`${getApiBaseUrl()}/recipes/import`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    } catch (error) {
        return {
            ok: false,
            status: 0,
            error: 'network',
            message: error?.message || 'Load failed',
        };
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
        return {
            ok: false,
            status: res.status,
            error: payload?.error,
            message: payload?.message || "Couldn't import that video.",
        };
    }
    return { ok: true, body: payload };
}

/**
 * Import a recipe from a user-attached screen recording (owner platform AI / OpenRouter).
 */
export async function importRecipeFromVideoAsset(asset, options = {}) {
    const prepared = await prepareVideoForAi(asset);
    const bytes = Math.floor((prepared.base64.length * 3) / 4);
    if (bytes > MAX_RECIPE_VIDEO_BYTES) {
        return {
            success: false,
            error: 'That video is too large (max 25 MB). Trim the clip or record a shorter clip.',
        };
    }
    const result = await postImport({
        video: { mimeType: prepared.mimeType, data: prepared.base64 },
        sourceUrl: options.sourceUrl || null,
        author: options.author || null,
        sourcePlatform: options.sourcePlatform || (options.sourceUrl ? 'instagram' : null),
        note: options.note || '',
    });
    if (!result.ok) {
        return { success: false, error: result.message };
    }
    const payload = result.body;
    if (payload?.ingredients?.length && payload?.steps?.length) {
        return {
            success: true,
            recipe: mapStructuredPayload(payload, options.sourceUrl),
            aiExtracted: true,
        };
    }
    return { success: false, error: "Couldn't find a recipe in that video." };
}

export function extractInstagramUrlFromText(text) {
    const match = String(text || '').match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/i);
    return match ? match[0].replace(/[),.]+$/, '') : null;
}

export function extractTikTokUrlFromText(text) {
    const match = String(text || '').match(/https?:\/\/(?:vm|vt|www\.)?tiktok\.com\/[^\s]+/i);
    return match ? match[0].replace(/[),.]+$/, '') : null;
}

export function extractSocialUrlFromText(text) {
    return extractInstagramUrlFromText(text) || extractTikTokUrlFromText(text);
}
