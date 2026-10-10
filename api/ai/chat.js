import { applyCors } from '../lib/cors.js';
import {
    estimateTokens,
    getDailyLimits,
    getOpenRouterConfig,
    isEmailAllowed,
    isOwnerGateConfigured,
    requireSecrets,
} from '../lib/env.js';
import { bearerToken, verifySession } from '../lib/session.js';
import { getUsage, recordUsage } from '../lib/store.js';

const FRIENDLY_LIMIT =
    "You've hit today's owner AI safety limit. Try again tomorrow, or use your own API key in Account.";

function buildMessages(body) {
    const prompt = body?.prompt;
    if (!prompt || typeof prompt !== 'string') {
        throw new Error('Missing prompt');
    }
    const images = Array.isArray(body.images) ? body.images : [];
    if (!images.length) {
        return [{ role: 'user', content: prompt }];
    }
    const parts = [{ type: 'text', text: prompt }];
    for (const img of images) {
        if (!img?.data || !img?.mimeType) continue;
        const url = `data:${img.mimeType};base64,${img.data}`;
        parts.push({ type: 'image_url', image_url: { url } });
    }
    return [{ role: 'user', content: parts }];
}

class UpstreamError extends Error {
    constructor(status, message, model) {
        super(message);
        this.name = 'UpstreamError';
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

// OpenRouter retires model IDs; a stale one fails every request with a 400/404.
const isModelRejected = (error) =>
    error instanceof UpstreamError &&
    (error.status === 400 || error.status === 404) &&
    /model/i.test(error.message);

async function openRouterStream({ model, messages, maxTokens }) {
    const apiKey = process.env.OPENROUTER_API_KEY;
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
            body: JSON.stringify({
                model,
                messages,
                max_tokens: maxTokens,
                stream: true,
            }),
        });
    } catch (error) {
        throw new UpstreamError(0, `Couldn't reach OpenRouter: ${error?.message || 'network error'}`, model);
    }
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new UpstreamError(response.status, upstreamMessage(response.status, text), model);
    }
    return response;
}

async function openRouterWithFallback({ models, messages, maxTokens }) {
    let lastError;
    for (const model of models) {
        try {
            return { upstream: await openRouterStream({ model, messages, maxTokens }), model };
        } catch (error) {
            lastError = error;
            if (!isModelRejected(error)) throw error;
            console.warn(`[ai/chat] model rejected by OpenRouter: ${model} (${error.status}) ${error.message}`);
        }
    }
    throw lastError;
}

function reject(res, status, body) {
    console.warn(`[ai/chat] ${status} ${body.error}${body.message ? `: ${body.message}` : ''}`);
    res.status(status).json(body);
}

export default async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
        reject(res, 405, { error: 'method_not_allowed' });
        return;
    }

    if (!isOwnerGateConfigured()) {
        reject(res, 503, {
            error: 'platform_disabled',
            message: 'Owner platform AI is not enabled (ALLOWED_EMAILS is required).',
        });
        return;
    }

    try {
        requireSecrets();
    } catch (error) {
        reject(res, 503, { error: 'misconfigured', message: error.message });
        return;
    }

    const token = bearerToken(req);
    if (!token) {
        reject(res, 401, { error: 'unauthorized', message: 'No owner session was sent. Sign in again in Account.' });
        return;
    }

    let session;
    try {
        session = await verifySession(token);
    } catch {
        reject(res, 401, { error: 'unauthorized', message: 'Owner session expired or invalid. Sign in again in Account.' });
        return;
    }

    if (!isEmailAllowed(session.email)) {
        reject(res, 403, { error: 'not_allowed', message: 'This Google account is not on the owner allowlist.' });
        return;
    }

    const limits = getDailyLimits();
    const usage = await getUsage(session.sub);
    if (usage.requests >= limits.maxRequests || usage.tokens >= limits.maxTokens) {
        reject(res, 429, { error: 'rate_limited', message: FRIENDLY_LIMIT });
        return;
    }

    const { defaultModel, allowedModels, fallbackModels } = getOpenRouterConfig();
    const requested = req.body?.model;
    const primary =
        requested && allowedModels.includes(requested) ? requested : defaultModel;
    const models = [primary, ...fallbackModels.filter((m) => m !== primary)];
    const isTest = req.body?.test === true;
    const maxTokens = isTest
        ? 16
        : Math.min(8192, Math.max(256, Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS || 4096)));

    let messages;
    try {
        messages = buildMessages(isTest ? { prompt: 'Reply with the single word: OK' } : req.body);
    } catch (error) {
        reject(res, 400, { error: 'bad_request', message: error.message });
        return;
    }

    const promptEstimate = estimateTokens(isTest ? 'OK' : req.body?.prompt || '');
    if (usage.tokens + promptEstimate > limits.maxTokens) {
        reject(res, 429, { error: 'rate_limited', message: FRIENDLY_LIMIT });
        return;
    }

    const streamRequested = !isTest && req.body?.stream !== false;
    const startedAt = Date.now();

    try {
        const { upstream, model } = await openRouterWithFallback({ models, messages, maxTokens });

        if (!streamRequested) {
            const reader = upstream.body.getReader();
            const decoder = new TextDecoder();
            let full = '';
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const data = trimmed.slice(5).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const json = JSON.parse(data);
                        const piece = json.choices?.[0]?.delta?.content;
                        if (piece) full += piece;
                    } catch {
                        // skip malformed chunk
                    }
                }
            }
            const outEstimate = estimateTokens(full);
            await recordUsage(session.sub, { requestDelta: 1, tokenDelta: promptEstimate + outEstimate });
            res.status(200).json({
                text: full,
                model,
                ...(model !== primary ? { fallbackFrom: primary } : null),
                ...(isTest ? { latencyMs: Date.now() - startedAt } : null),
            });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let outText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                res.write(`${line}\n`);
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                    const json = JSON.parse(data);
                    const piece = json.choices?.[0]?.delta?.content;
                    if (piece) outText += piece;
                } catch {
                    // ignore
                }
            }
        }
        res.end();
        const outEstimate = estimateTokens(outText);
        await recordUsage(session.sub, { requestDelta: 1, tokenDelta: promptEstimate + outEstimate });
    } catch (error) {
        const upstreamStatus = error instanceof UpstreamError ? error.status : null;
        const reason = error?.message || 'Unknown error';
        console.error(`[ai/chat] upstream failed: status=${upstreamStatus} model=${error?.model || primary} ${reason}`);
        if (!res.headersSent) {
            res.status(502).json({
                error: 'upstream_failed',
                upstreamStatus,
                model: error?.model || primary,
                message: upstreamStatus
                    ? `OpenRouter ${upstreamStatus}: ${reason}`
                    : reason,
            });
        } else {
            res.end();
        }
    }
};
