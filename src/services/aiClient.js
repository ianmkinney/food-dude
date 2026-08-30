import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    DEFAULT_IMAGE_MODELS,
    DEFAULT_MODELS,
    FALLBACK_IMAGE_MODELS,
    MISSING_KEY_MESSAGE,
    getActiveCredentials,
    getApiKey,
    getCachedImageModels,
    getCachedModels,
    requireAiConfigured,
    setCachedImageModels,
    setCachedModels,
} from './aiSettings';
import { assertVideoSupported, coerceImagesForProvider } from './mediaPrep';
import { describeMimeType, isImageMimeSupportedBy, normalizeMimeType } from './mediaTypes';

const ANTHROPIC_VERSION = '2023-06-01';

function httpErrorMessage(status, bodyText) {
    const snippet = (bodyText || '').replace(/\s+/g, ' ').slice(0, 180);
    if (status === 401 || status === 403) {
        return 'That API key was rejected. Check it in Account.';
    }
    if (status === 429) {
        return 'The provider rate-limited this request. Try again in a moment.';
    }
    if (status === 404) {
        return 'The selected model was not found. Pick another model in Account.';
    }
    if (status >= 500) {
        return `The provider is unavailable (${status}). Try again shortly.`;
    }
    return snippet
        ? `Provider error ${status}: ${snippet}`
        : `Provider error ${status}.`;
}

async function readErrorBody(response) {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

async function fetchJson(url, options) {
    let response;
    try {
        response = await fetch(url, options);
    } catch (error) {
        const message = error?.message || 'Network request failed';
        throw new Error(`Couldn't reach the provider. ${message}`);
    }

    if (!response.ok) {
        const body = await readErrorBody(response);
        throw new Error(httpErrorMessage(response.status, body));
    }

    return response.json();
}

export function stripCodeFences(text) {
    let cleaned = (text || '').trim();
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```\n?/g, '');
    }
    return cleaned.trim();
}

function flashRank(id) {
    const lower = (id || '').toLowerCase();
    if (/(haiku|mini|nano|flash|lite)/.test(lower)) return 0;
    if (/(sonnet|gpt-4o(?!-mini)|grok-3(?!-mini))/.test(lower)) return 1;
    return 2;
}

function sortModels(models) {
    return [...models].sort((a, b) => {
        const rank = flashRank(a.id) - flashRank(b.id);
        if (rank !== 0) return rank;
        return a.id.localeCompare(b.id);
    });
}

function isChattyOpenAiModel(id) {
    const lower = (id || '').toLowerCase();
    const excluded = [
        'embedding',
        'whisper',
        'tts',
        'dall-e',
        'davinci',
        'babbage',
        'ada',
        'moderation',
        'transcribe',
        'realtime',
        'search',
        'sora',
        'audio',
        'image',
        'computer-use',
        'codex-mini',
    ];
    if (excluded.some((part) => lower.includes(part))) return false;
    return /^(gpt|o[1-9]|chatgpt|grok)/.test(lower) || lower.includes('chat');
}

function isGeminiImageModel(model) {
    const name = (model.name || '').replace(/^models\//, '');
    const lower = name.toLowerCase();
    const methods = model.supportedGenerationMethods || [];
    if (!methods.includes('generateContent')) return false;
    return /(image-generation|-image$|-image-preview|flash-image|pro-image)/.test(lower);
}

function isChattyGeminiModel(model) {
    const name = (model.name || '').replace(/^models\//, '');
    const lower = name.toLowerCase();
    if (/(embedding|imagen|aqa|tts|robotics|computer-use|veo|image-generation|-image$|-image-preview|flash-image|pro-image)/.test(lower)) {
        return false;
    }
    const methods = model.supportedGenerationMethods || [];
    return methods.includes('generateContent');
}

function imageRank(id) {
    const lower = (id || '').toLowerCase();
    if (/(lite|flash)/.test(lower) && /lite/.test(lower)) return 0;
    if (/flash/.test(lower)) return 1;
    if (/pro/.test(lower)) return 2;
    return 3;
}

function sortImageModels(models) {
    return [...models].sort((a, b) => {
        const rank = imageRank(a.id) - imageRank(b.id);
        if (rank !== 0) return rank;
        return a.id.localeCompare(b.id);
    });
}

function defaultModelFor(provider) {
    return DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
}

/**
 * Providers compare the declared media type against the bytes, so never guess.
 */
function requireImageMimeType(provider, image) {
    const mimeType = normalizeMimeType(image?.mimeType);
    if (!mimeType) {
        throw new Error("Couldn't tell what format that image is. Try a screenshot or photo (PNG/JPEG).");
    }
    if (!isImageMimeSupportedBy(provider, mimeType)) {
        throw new Error(
            `${describeMimeType(mimeType)} images aren't supported by the selected model. Try a screenshot or photo (PNG/JPEG).`
        );
    }
    return mimeType;
}

async function anthropicMessages({ apiKey, model, prompt, images }) {
    const content = [];
    if (images?.length) {
        for (const image of images) {
            content.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: requireImageMimeType('anthropic', image),
                    data: image.data,
                },
            });
        }
    }
    content.push({ type: 'text', text: prompt });

    const json = await fetchJson('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
            model,
            max_tokens: 8192,
            messages: [{ role: 'user', content }],
        }),
    });

    const text = (json.content || [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
        .trim();
    if (!text) {
        throw new Error('The model returned an empty response.');
    }
    return text;
}

async function openAiCompatibleChat({ baseUrl, apiKey, model, prompt, images, provider }) {
    let content;
    if (images?.length) {
        content = [
            { type: 'text', text: prompt },
            ...images.map((image) => ({
                type: 'image_url',
                image_url: {
                    url: `data:${requireImageMimeType(provider, image)};base64,${image.data}`,
                },
            })),
        ];
    } else {
        content = prompt;
    }

    const json = await fetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
        }),
    });

    const text = json.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') {
        throw new Error('The model returned an empty response.');
    }
    return text.trim();
}

function geminiClient(apiKey) {
    return new GoogleGenerativeAI(apiKey);
}

async function geminiGenerate({ apiKey, model, prompt, images, video }) {
    const genAI = geminiClient(apiKey);
    const generativeModel = genAI.getGenerativeModel({ model });
    const parts = [prompt];

    if (images?.length) {
        for (const image of images) {
            parts.push({
                inlineData: {
                    data: image.data,
                    mimeType: requireImageMimeType('gemini', image),
                },
            });
        }
    }

    if (video) {
        assertVideoSupported('gemini', video.mimeType);
        parts.push({
            inlineData: {
                data: video.data,
                mimeType: normalizeMimeType(video.mimeType),
            },
        });
    }

    const result = await generativeModel.generateContent(parts);
    const response = await result.response;
    const text = response.text();
    if (!text) {
        throw new Error('The model returned an empty response.');
    }
    return text;
}

export async function generateText(prompt, options = {}) {
    const creds = await requireAiConfigured();
    const model = options.model || creds.model || defaultModelFor(creds.provider);

    switch (creds.provider) {
        case 'anthropic':
            return anthropicMessages({ apiKey: creds.apiKey, model, prompt });
        case 'openai':
            return openAiCompatibleChat({
                provider: 'openai',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: creds.apiKey,
                model,
                prompt,
            });
        case 'xai':
            return openAiCompatibleChat({
                provider: 'xai',
                baseUrl: 'https://api.x.ai/v1',
                apiKey: creds.apiKey,
                model,
                prompt,
            });
        case 'gemini':
            return geminiGenerate({ apiKey: creds.apiKey, model, prompt });
        default:
            throw new Error('Unknown AI provider. Pick one in Account.');
    }
}

export async function generateMultimodal({ prompt, images, video }) {
    const creds = await requireAiConfigured();
    const model = creds.model || defaultModelFor(creds.provider);

    if (video && creds.provider !== 'gemini') {
        throw new Error('Video analysis is only available with Google Gemini. Switch provider in Account.');
    }

    const readyImages = await coerceImagesForProvider(images, creds.provider);

    switch (creds.provider) {
        case 'anthropic':
            return anthropicMessages({ apiKey: creds.apiKey, model, prompt, images: readyImages });
        case 'openai':
            return openAiCompatibleChat({
                provider: 'openai',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: creds.apiKey,
                model,
                prompt,
                images: readyImages,
            });
        case 'xai':
            return openAiCompatibleChat({
                provider: 'xai',
                baseUrl: 'https://api.x.ai/v1',
                apiKey: creds.apiKey,
                model,
                prompt,
                images: readyImages,
            });
        case 'gemini':
            return geminiGenerate({ apiKey: creds.apiKey, model, prompt, images: readyImages, video });
        default:
            throw new Error('Unknown AI provider. Pick one in Account.');
    }
}

export async function generateImage(prompt) {
    const creds = await requireAiConfigured();
    if (creds.provider !== 'gemini') {
        throw new Error('Recipe image generation needs Google Gemini. Switch provider in Account and pick an image model.');
    }

    const model = creds.imageModel || DEFAULT_IMAGE_MODELS.gemini;
    const json = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(creds.apiKey)}`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                },
            }),
        }
    );

    const parts = json.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData);
    if (!imagePart?.inlineData?.data) {
        throw new Error('The image model returned no photo. Try another image model in Account.');
    }

    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    return {
        imageUri: `data:${mimeType};base64,${imagePart.inlineData.data}`,
        response: json,
    };
}

async function listAnthropicModels(apiKey) {
    const json = await fetchJson('https://api.anthropic.com/v1/models', {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
        },
    });
    return (json.data || []).map((item) => ({
        id: item.id,
        name: item.display_name || item.id,
    }));
}

async function listOpenAiCompatibleModels(baseUrl, apiKey) {
    const json = await fetchJson(`${baseUrl}/models`, {
        headers: {
            authorization: `Bearer ${apiKey}`,
        },
    });
    return (json.data || [])
        .map((item) => item.id)
        .filter(isChattyOpenAiModel)
        .map((id) => ({ id, name: id }));
}

async function listGeminiModels(apiKey) {
    const chat = [];
    const image = [];
    let pageToken = '';
    do {
        const params = new URLSearchParams({ key: apiKey, pageSize: '100' });
        if (pageToken) params.set('pageToken', pageToken);
        const json = await fetchJson(
            `https://generativelanguage.googleapis.com/v1beta/models?${params.toString()}`
        );
        for (const model of json.models || []) {
            const id = (model.name || '').replace(/^models\//, '');
            const entry = { id, name: model.displayName || id };
            if (isGeminiImageModel(model)) {
                image.push(entry);
            } else if (isChattyGeminiModel(model)) {
                chat.push(entry);
            }
        }
        pageToken = json.nextPageToken || '';
    } while (pageToken);
    return { chat, image };
}

export async function listProviderModels({ provider, apiKey, force = false } = {}) {
    const creds = await getActiveCredentials();
    const resolvedProvider = provider || creds.provider;
    const resolvedKey = apiKey || (await getApiKey(resolvedProvider));
    if (!resolvedKey) {
        throw new Error(MISSING_KEY_MESSAGE);
    }

    if (!force) {
        const cached = await getCachedModels(resolvedProvider);
        const imageCached = await getCachedImageModels(resolvedProvider);
        if (cached?.models?.length) {
            return {
                models: cached.models,
                imageModels: imageCached?.models || [],
                fromCache: true,
                fetchedAt: cached.fetchedAt,
            };
        }
    }

    let models = [];
    let imageModels = [];
    switch (resolvedProvider) {
        case 'anthropic':
            models = await listAnthropicModels(resolvedKey);
            break;
        case 'openai':
            models = await listOpenAiCompatibleModels('https://api.openai.com/v1', resolvedKey);
            break;
        case 'xai':
            models = await listOpenAiCompatibleModels('https://api.x.ai/v1', resolvedKey);
            break;
        case 'gemini': {
            const listed = await listGeminiModels(resolvedKey);
            models = listed.chat;
            imageModels = listed.image;
            break;
        }
        default:
            throw new Error('Unknown AI provider.');
    }

    const sorted = sortModels(models);
    const sortedImage = sortImageModels(imageModels);
    const cache = await setCachedModels(resolvedProvider, sorted);
    await setCachedImageModels(resolvedProvider, sortedImage);
    return {
        models: sorted,
        imageModels: sortedImage,
        fromCache: false,
        fetchedAt: cache.fetchedAt,
    };
}

export function fallbackModels(provider) {
    const id = defaultModelFor(provider);
    return [{ id, name: id, isFallback: true }];
}

export function fallbackImageModels(provider) {
    const listed = FALLBACK_IMAGE_MODELS[provider] || [];
    return listed.map((item, index) => ({
        ...item,
        isFallback: index === 0,
    }));
}
