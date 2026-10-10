import { extractRecipeFromVideoBase64 } from './recipeVideoAi.js';

const VIDEO_MIME = /^video\/(mp4|quicktime|webm|mpeg|3gpp|x-msvideo)$/i;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function base64ByteLength(b64) {
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return Math.floor((b64.length * 3) / 4) - padding;
}

export function validateUploadedVideo(video) {
    if (!video || typeof video !== 'object') throw new Error('bad_request');
    const mimeType = String(video.mimeType || '').toLowerCase();
    const data = String(video.data || '').replace(/\s/g, '');
    if (!VIDEO_MIME.test(mimeType) || !data) throw new Error('bad_request');
    if (!BASE64_RE.test(data) || data.length % 4 !== 0) throw new Error('bad_request');
    const bytes = base64ByteLength(data);
    if (bytes > MAX_VIDEO_BYTES) {
        const err = new Error('video_too_large');
        err.code = 'video_too_large';
        throw err;
    }
    if (bytes < 1024) throw new Error('bad_request');
    return { mimeType, base64: data, bytes };
}

export function mapAiRecipeToImportResponse(recipe, meta) {
    const ingredients = (recipe.ingredients || []).map((line) => String(line));
    const steps = (recipe.instructions || recipe.steps || []).map((line) => String(line));
    return {
        title: recipe.title,
        description: recipe.description || null,
        servings: recipe.servings ?? null,
        times: {
            prepMinutes: recipe.prepTime ?? null,
            cookMinutes: recipe.cookTime ?? null,
            totalMinutes: recipe.totalTime ?? null,
        },
        ingredients,
        steps,
        image: null,
        sourceUrl: meta.sourceUrl,
        sourcePlatform: meta.sourcePlatform || 'instagram',
        author: meta.author || null,
        aiExtracted: true,
        extractionMethod: meta.extractionMethod || 'video',
        audioUsed: meta.audioUsed ?? false,
    };
}

export async function runVideoRecipeExtraction({ apiKey, mimeType, base64, extraContext, meta }) {
    const { recipe, method, audioUsed } = await extractRecipeFromVideoBase64({
        apiKey,
        mimeType,
        base64,
        extraContext,
    });
    return mapAiRecipeToImportResponse(recipe, {
        ...meta,
        extractionMethod: method,
        audioUsed,
    });
}
