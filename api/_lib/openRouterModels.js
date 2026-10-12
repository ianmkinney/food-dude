import { getOpenRouterConfig } from './env.js';
import { getOpenRouterImageModel } from './openRouterImage.js';

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_MS = 60 * 60 * 1000;

/** @type {{ fetchedAt: number, models: NormalizedModel[], byId: Map<string, NormalizedModel> }} */
let cache = { fetchedAt: 0, models: [], byId: new Map() };

export const VISION_FALLBACK_CHAT_MODEL = 'google/gemini-2.5-flash';

/**
 * @typedef {{ id: string, name: string, inputModalities: string[], outputModalities: string[], supportedParameters: string[], pricePerMillionPrompt: number | null, pricePerMillionCompletion: number | null }} NormalizedModel
 */

/** OpenRouter `supported_parameters` entries Ampi chat relies on (structured JSON + tool actions). */
export const AMPI_CHAT_SUPPORTED_PARAMS = ['tools', 'response_format', 'structured_outputs'];

function modalityList(raw, key) {
    const arch = raw?.architecture?.[key];
    if (Array.isArray(arch) && arch.length) return arch.map(String);
    const top = raw?.top_provider?.[key];
    if (Array.isArray(top) && top.length) return top.map(String);
    return null;
}

function outputModalities(raw) {
    return modalityList(raw, 'output_modalities') || ['text'];
}

function inputModalities(raw) {
    return modalityList(raw, 'input_modalities') || ['text'];
}

export function modelSupportsVision(model) {
    if (!model) return false;
    const inputs = model.inputModalities || ['text'];
    return inputs.includes('image') || inputs.includes('file');
}

function pricePerMillionUsd(perToken) {
    const n = Number(perToken);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n * 1_000_000;
}

function supportedParameters(raw) {
    const list = raw?.supported_parameters;
    if (!Array.isArray(list)) return [];
    return list.map((p) => String(p).trim()).filter(Boolean);
}

function normalizeModel(raw) {
    const id = String(raw?.id || '').trim();
    if (!id) return null;
    const pricing = raw?.pricing || {};
    return {
        id,
        name: String(raw?.name || id).trim(),
        inputModalities: inputModalities(raw),
        outputModalities: outputModalities(raw),
        supportedParameters: supportedParameters(raw),
        pricePerMillionPrompt: pricePerMillionUsd(pricing.prompt),
        pricePerMillionCompletion: pricePerMillionUsd(pricing.completion),
    };
}

export function resetOpenRouterModelCache() {
    cache = { fetchedAt: 0, models: [], byId: new Map() };
}

export async function fetchOpenRouterModelCatalog(apiKey) {
    const now = Date.now();
    if (cache.byId.size && now - cache.fetchedAt < CACHE_MS) {
        return cache;
    }
    let response;
    try {
        response = await fetch(MODELS_URL, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://amplifood.vercel.app',
                'X-Title': 'AmpliFood',
            },
        });
    } catch (error) {
        throw new Error(`Couldn't reach OpenRouter models: ${error?.message || 'network error'}`);
    }
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`OpenRouter models HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const json = await response.json().catch(() => ({}));
    const rows = Array.isArray(json?.data) ? json.data : [];
    const models = rows.map(normalizeModel).filter(Boolean);
    const byId = new Map(models.map((m) => [m.id, m]));
    cache = { fetchedAt: now, models, byId };
    return cache;
}

export function isChatCatalogModel(model) {
    return model.outputModalities.includes('text');
}

export function modelSupportsParameter(model, param) {
    return (model?.supportedParameters || []).includes(param);
}

/**
 * Models usable for Ampi via the adapter (native tools, json_schema, or prompt JSON).
 * Any text-output model in the OpenRouter catalog qualifies.
 */
export function isAmpiChatCatalogModel(model) {
    return Boolean(model && isChatCatalogModel(model));
}

export function isImageCatalogModel(model) {
    return model.outputModalities.includes('image');
}

export function toPublicModelRow(model) {
    const prompt = model.pricePerMillionPrompt;
    const completion = model.pricePerMillionCompletion;
    const pricePerMillion =
        prompt != null && completion != null
            ? Math.max(prompt, completion)
            : prompt ?? completion ?? null;
    return {
        id: model.id,
        name: model.name,
        pricePerMillion,
        pricePerMillionPrompt: prompt,
        pricePerMillionCompletion: completion,
    };
}

export function getPlatformModelDefaults() {
    const { defaultModel } = getOpenRouterConfig();
    return {
        chat: defaultModel,
        image: getOpenRouterImageModel(),
    };
}

export async function resolveOwnerChatModel(requested, apiKey) {
    const { defaultModel, fallbackModels } = getOpenRouterConfig();
    const trimmed = typeof requested === 'string' ? requested.trim() : '';
    if (!trimmed) {
        return { primary: defaultModel, fallbackModels, fromRequest: false };
    }
    const { byId } = await fetchOpenRouterModelCatalog(apiKey);
    const row = byId.get(trimmed);
    if (row && isAmpiChatCatalogModel(row)) {
        return { primary: trimmed, fallbackModels, fromRequest: true };
    }
    return { primary: defaultModel, fallbackModels, fromRequest: false };
}

/**
 * When the request includes images, ensure the primary model accepts vision input.
 * @returns {Promise<{ primary: string, fallbackModels: string[], visionNote: string | null, visionFallbackFrom: string | null }>}
 */
export async function resolveOwnerChatModelForVision({ requested, apiKey, hasImages }) {
    const base = await resolveOwnerChatModel(requested, apiKey);
    if (!hasImages) {
        return { ...base, visionNote: null, visionFallbackFrom: null };
    }
    const { byId } = await fetchOpenRouterModelCatalog(apiKey);
    const primaryRow = byId.get(base.primary);
    if (modelSupportsVision(primaryRow)) {
        return { ...base, visionNote: null, visionFallbackFrom: null };
    }
    const vision = VISION_FALLBACK_CHAT_MODEL;
    const fallbacks = [base.primary, ...base.fallbackModels.filter((m) => m !== vision && m !== base.primary)];
    const note = base.fromRequest
        ? `Using ${vision} to read your images (${base.primary} doesn't accept image input).`
        : `Using ${vision} to read your images.`;
    return {
        primary: vision,
        fallbackModels: fallbacks,
        fromRequest: base.fromRequest,
        visionNote: note,
        visionFallbackFrom: base.primary,
    };
}

export async function resolveOwnerImageModel(requested, apiKey) {
    const defaultModel = getOpenRouterImageModel();
    const trimmed = typeof requested === 'string' ? requested.trim() : '';
    if (!trimmed) {
        return { model: defaultModel, fromRequest: false };
    }
    const { byId } = await fetchOpenRouterModelCatalog(apiKey);
    const row = byId.get(trimmed);
    if (row && isImageCatalogModel(row)) {
        return { model: trimmed, fromRequest: true };
    }
    return { model: defaultModel, fromRequest: false };
}
