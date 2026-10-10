const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const IMAGE_PROMPT_MAX_CHARS = 12_000;
export const IMAGE_REQUESTS_PER_MINUTE = 5;

const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,/i;

export function getOpenRouterImageModel() {
    const configured = process.env.OPENROUTER_IMAGE_MODEL;
    if (configured && String(configured).trim()) {
        return String(configured).trim();
    }
    return 'google/gemini-2.5-flash-image';
}

export function validateImagePrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
        throw new Error('Missing prompt');
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
        throw new Error('Missing prompt');
    }
    if (trimmed.length > IMAGE_PROMPT_MAX_CHARS) {
        throw new Error('Prompt too long');
    }
    return trimmed;
}

function upstreamMessage(status, text) {
    try {
        const json = JSON.parse(text);
        const msg = json?.error?.message || json?.message;
        if (msg) return String(msg).slice(0, 300);
    } catch {
        // not JSON
    }
    return (text || '').replace(/\s+/g, ' ').trim().slice(0, 300) || `HTTP ${status}`;
}

export class OpenRouterImageError extends Error {
    constructor(status, message, model) {
        super(message);
        this.name = 'OpenRouterImageError';
        this.status = status;
        this.model = model;
    }
}

/**
 * Parse a generated image from an OpenRouter chat completion message.
 * @param {unknown} message
 * @returns {string | null} data:image/…;base64,…
 */
export function parseImageDataUrlFromMessage(message) {
    if (!message || typeof message !== 'object') return null;

    const images = message.images;
    if (Array.isArray(images)) {
        for (const img of images) {
            const url = img?.image_url?.url;
            if (typeof url === 'string' && DATA_IMAGE_RE.test(url)) {
                return url;
            }
        }
    }

    const content = message.content;
    if (Array.isArray(content)) {
        for (const part of content) {
            const url = part?.image_url?.url;
            if (typeof url === 'string' && DATA_IMAGE_RE.test(url)) {
                return url;
            }
            if (part?.type === 'image_url' && typeof part?.url === 'string' && DATA_IMAGE_RE.test(part.url)) {
                return part.url;
            }
        }
    }

    if (typeof content === 'string' && DATA_IMAGE_RE.test(content.trim())) {
        return content.trim();
    }

    return null;
}

/**
 * @returns {Promise<{ imageUri: string, model: string, raw: unknown }>}
 */
export async function openRouterGenerateImage({ apiKey, model, prompt }) {
    let response;
    try {
        response = await fetch(OPENROUTER_CHAT_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://amplifood.vercel.app',
                'X-Title': 'AmpliFood',
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                modalities: ['image', 'text'],
                stream: false,
            }),
        });
    } catch (error) {
        throw new OpenRouterImageError(0, `Couldn't reach OpenRouter: ${error?.message || 'network error'}`, model);
    }

    const text = await response.text().catch(() => '');
    if (!response.ok) {
        throw new OpenRouterImageError(response.status, upstreamMessage(response.status, text), model);
    }

    let json;
    try {
        json = text ? JSON.parse(text) : {};
    } catch {
        throw new OpenRouterImageError(502, 'Invalid response from image model.', model);
    }

    const message = json.choices?.[0]?.message;
    const imageUri = parseImageDataUrlFromMessage(message);
    if (!imageUri) {
        throw new OpenRouterImageError(502, 'Image model returned no image.', model);
    }

    return { imageUri, model, raw: json };
}
