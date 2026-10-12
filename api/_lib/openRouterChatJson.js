/** One-shot OpenRouter chat completion (non-streaming). */

import { AMPI_STRATEGY, pickAmpiStrategy } from './ampiModelAdapter.js';

export class OpenRouterJsonError extends Error {
    constructor(status, message, model) {
        super(message);
        this.name = 'OpenRouterJsonError';
        this.status = status;
        this.model = model;
    }
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

export async function openRouterChatJson({
    apiKey,
    model,
    messages,
    maxTokens = 2048,
    signal,
    modelRow,
    responseFormat,
}) {
    const strategy = pickAmpiStrategy(modelRow);
    const body = {
        model,
        messages,
        max_tokens: maxTokens,
        stream: false,
    };
    if (strategy === AMPI_STRATEGY.JSON_SCHEMA) {
        body.response_format = responseFormat || { type: 'json_object' };
    }

    let response;
    try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://amplifood.vercel.app',
                'X-Title': 'AmpliFood',
            },
            body: JSON.stringify(body),
            signal,
        });
    } catch (error) {
        throw new OpenRouterJsonError(0, `Couldn't reach OpenRouter: ${error?.message || 'network error'}`, model);
    }
    const text = await response.text().catch(() => '');
    if (!response.ok) {
        throw new OpenRouterJsonError(response.status, upstreamMessage(response.status, text), model);
    }
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new OpenRouterJsonError(response.status, 'Invalid OpenRouter JSON response', model);
    }
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
        throw new OpenRouterJsonError(response.status, 'Empty model response', model);
    }
    return { text: content.trim(), model: json?.model || model };
}
