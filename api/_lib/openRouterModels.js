import { getOpenRouterConfig } from './env.js';
import { getOpenRouterImageModel } from './openRouterImage.js';

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_MS = 60 * 60 * 1000;

/** @type {{ fetchedAt: number, models: NormalizedModel[], byId: Map<string, NormalizedModel> }} */
let cache = { fetchedAt: 0, models: [], byId: new Map() };

/**
 * @typedef {{ id: string, name: string, outputModalities: string[], pricePerMillionPrompt: number | null, pricePerMillionCompletion: number | null }} NormalizedModel
 */

function outputModalities(raw) {
    const arch = raw?.architecture?.output_modalities;
    if (Array.isArray(arch) && arch.length) return arch.map(String);
    const top = raw?.top_provider?.output_modalities;
    if (Array.isArray(top) && top.length) return top.map(String);
    return ['text'];
}

function pricePerMillionUsd(perToken) {
    const n = Number(perToken);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n * 1_000_000;
}

function normalizeModel(raw) {
    const id = String(raw?.id || '').trim();
    if (!id) return null;
    const pricing = raw?.pricing || {};
    return {
        id,
        name: String(raw?.name || id).trim(),
        outputModalities: outputModalities(raw),
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
    if (row && isChatCatalogModel(row)) {
        return { primary: trimmed, fallbackModels, fromRequest: true };
    }
    return { primary: defaultModel, fallbackModels, fromRequest: false };
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
