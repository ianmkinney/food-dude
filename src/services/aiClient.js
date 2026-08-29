import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    DEFAULT_IMAGE_MODELS,
    DEFAULT_MODELS,
    getCachedModels,
    requireAiConfigured,
    setCachedModels,
} from './aiSettings';

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

function isChattyGeminiModel(model) {
    const name = (model.name || '').replace(/^models\//, '');
    const lower = name.toLowerCase();
    if (/(embedding|imagen|aqa|tts|robotics|computer-use|veo)/.test(lower)) {
        return false;
    }
    const methods = model.supportedGenerationMethods || [];
    return methods.includes('generateContent');
}

function defaultModelFor(provider) {
    return DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
}

async function anthropicMessages({ apiKey, model, prompt, images }) {
    const content = [];
    if (images?.length) {
        for (const image of images) {
            content.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: image.mimeType || 'image/jpeg',
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

async function openAiCompatibleChat({ baseUrl, apiKey, model, prompt, images }) {
    let content;
    if (images?.length) {
        content = [
            { type: 'text', text: prompt },
            ...images.map((image) => ({
                type: 'image_url',
                image_url: {
                    url: `data:${image.mimeType || 'image/jpeg'};base64,${image.data}`,
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
                    mimeType: image.mimeType || 'image/jpeg',
                },
            });
        }
    }

    if (video) {
        parts.push({
            inlineData: {
                data: video.data,
                mimeType: video.mimeType || 'video/mp4',
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
                baseUrl: 'https://api.openai.com/v1',
                apiKey: creds.apiKey,
                model,
                prompt,
            });
        case 'xai':
            return openAiCompatibleChat({
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

    switch (creds.provider) {
        case 'anthropic':
            return anthropicMessages({ apiKey: creds.apiKey, model, prompt, images });
        case 'openai':
            return openAiCompatibleChat({
                baseUrl: 'https://api.openai.com/v1',
                apiKey: creds.apiKey,
                model,
                prompt,
                images,
            });
        case 'xai':
            return openAiCompatibleChat({
                baseUrl: 'https://api.x.ai/v1',
                apiKey: creds.apiKey,
                model,
                prompt,
                images,
            });
        case 'gemini':
            return geminiGenerate({ apiKey: creds.apiKey, model, prompt, images, video });
        default:
            throw new Error('Unknown AI provider. Pick one in Account.');
    }
}

export async function generateImage(prompt) {
    const creds = await requireAiConfigured();
    if (creds.provider !== 'gemini') {
        throw new Error('Recipe image generation needs Google Gemini. Switch provider in Account or skip this step.');
    }

    const model = (creds.model || '').toLowerCase().includes('image')
        ? creds.model
        : DEFAULT_IMAGE_MODELS.gemini;

    const genAI = geminiClient(creds.apiKey);
    const generativeModel = genAI.getGenerativeModel({ model });
    const result = await generativeModel.generateContent(prompt);
    const response = await result.response;
    const candidates = response.candidates;
    if (!candidates?.length) {
        throw new Error('No image candidates returned');
    }

    const imagePart = candidates[0]?.content?.parts?.find((part) => part.inlineData);
    if (!imagePart?.inlineData) {
        throw new Error('No image data found in response');
    }

    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    return {
        imageUri: `data:${mimeType};base64,${imagePart.inlineData.data}`,
        response,
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
    const models = [];
    let pageToken = '';
    do {
        const params = new URLSearchParams({ key: apiKey, pageSize: '100' });
        if (pageToken) params.set('pageToken', pageToken);
        const json = await fetchJson(
            `https://generativelanguage.googleapis.com/v1beta/models?${params.toString()}`
        );
        for (const model of json.models || []) {
            if (!isChattyGeminiModel(model)) continue;
            const id = (model.name || '').replace(/^models\//, '');
            models.push({ id, name: model.displayName || id });
        }
        pageToken = json.nextPageToken || '';
    } while (pageToken);
    return models;
}

export async function listProviderModels({ provider, apiKey, force = false } = {}) {
    const creds = provider && apiKey ? { provider, apiKey } : await requireAiConfigured();
    const resolvedProvider = provider || creds.provider;
    const resolvedKey = apiKey || creds.apiKey;

    if (!force) {
        const cached = await getCachedModels(resolvedProvider);
        if (cached?.models?.length) {
            return { models: cached.models, fromCache: true, fetchedAt: cached.fetchedAt };
        }
    }

    let models = [];
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
        case 'gemini':
            models = await listGeminiModels(resolvedKey);
            break;
        default:
            throw new Error('Unknown AI provider.');
    }

    const sorted = sortModels(models);
    const cache = await setCachedModels(resolvedProvider, sorted);
    return { models: sorted, fromCache: false, fetchedAt: cache.fetchedAt };
}

export function fallbackModels(provider) {
    const id = defaultModelFor(provider);
    return [{ id, name: id, isFallback: true }];
}
