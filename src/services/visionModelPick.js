import { DEFAULT_MODELS } from './aiSettings';

/** OpenRouter vision fallback (platform path uses the same id). */
export const VISION_FALLBACK_MODEL_LABEL = 'google/gemini-2.5-flash';

function modelIdLooksVisionCapable(provider, modelId) {
    const id = String(modelId || '').toLowerCase();
    if (!id) return false;
    if (provider === 'gemini') return true;
    if (provider === 'anthropic') {
        return /claude-(3|3\.|sonnet|opus|haiku)/.test(id) || id.includes('claude-3-5');
    }
    if (provider === 'openai') {
        return /gpt-4o|gpt-4\.1|gpt-5|vision/.test(id);
    }
    if (provider === 'xai') {
        return /grok-2|grok-3(?!-mini)|vision/.test(id);
    }
    return false;
}

/**
 * Pick a model that can read images for BYOK providers.
 * @returns {{ model: string, visionNote: string | null }}
 */
export function resolveByokVisionModel(provider, model) {
    const current = model || DEFAULT_MODELS[provider];
    if (modelIdLooksVisionCapable(provider, current)) {
        return { model: current, visionNote: null };
    }
    const fallbacks = {
        openai: 'gpt-4o-mini',
        anthropic: 'claude-3-5-haiku-latest',
        xai: 'grok-2-vision-1212',
        gemini: 'gemini-2.5-flash',
    };
    const next = fallbacks[provider] || current;
    if (next === current) return { model: current, visionNote: null };
    return {
        model: next,
        visionNote: `Switched to ${next} to read your images.`,
    };
}
