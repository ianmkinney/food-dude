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
import {
    acquireConcurrency,
    checkMinuteRateLimit,
    reconcileDailyUsage,
    reserveDailyUsage,
    StoreMisconfiguredError,
} from '../lib/store.js';

const FRIENDLY_LIMIT =
    "You've hit today's owner AI safety limit. Try again tomorrow, or use your own API key in Account.";

const MSG = {
    method_not_allowed: 'Method not allowed.',
    platform_disabled: 'Owner platform AI is not enabled.',
    misconfigured: 'Server configuration error.',
    unauthorized: 'Sign in again in Account.',
    not_allowed: 'This Google account is not authorized.',
    rate_limited: FRIENDLY_LIMIT,
    bad_request: 'Invalid request.',
    upstream_failed: 'AI request failed. Try again later.',
    concurrency_limited: 'Too many AI requests in progress. Wait a moment and try again.',
};

const IMAGE_MIME = /^image\/(png|jpeg|webp|gif)$/;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function base64ByteLength(b64) {
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return Math.floor((b64.length * 3) / 4) - padding;
}

function validateImages(images) {
    if (!Array.isArray(images)) return [];
    if (images.length > MAX_IMAGES) {
        throw new Error('Too many images');
    }
    const out = [];
    for (const img of images) {
        if (!img || typeof img !== 'object') continue;
        const mimeType = img.mimeType;
        const data = img.data;
        if (!mimeType || !data) continue;
        if (!IMAGE_MIME.test(String(mimeType))) {
            throw new Error('Unsupported image type');
        }
        const b64 = String(data).replace(/\s/g, '');
        if (!BASE64_RE.test(b64) || b64.length % 4 !== 0) {
            throw new Error('Invalid image data');
        }
        const bytes = base64ByteLength(b64);
        if (bytes > MAX_IMAGE_BYTES) {
            throw new Error('Image too large');
        }
        out.push({ mimeType: String(mimeType), data: b64 });
    }
    return out;
}

function buildMessages(body) {
    const prompt = body?.prompt;
    if (!prompt || typeof prompt !== 'string') {
        throw new Error('Missing prompt');
    }
    const images = validateImages(body?.images);
    if (!images.length) {
        return [{ role: 'user', content: prompt }];
    }
    const parts = [{ type: 'text', text: prompt }];
    for (const img of images) {
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

function reject(res, status, error, extra = {}) {
    console.warn(`[ai/chat] ${status} ${error}`);
    res.status(status).json({ error, message: MSG[error] || 'Request failed.', ...extra });
}

export default async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
        reject(res, 405, 'method_not_allowed');
        return;
    }

    if (!isOwnerGateConfigured()) {
        reject(res, 503, 'platform_disabled');
        return;
    }

    try {
        requireSecrets();
    } catch (error) {
        console.error('[ai/chat] secrets:', error?.message || error);
        reject(res, 503, 'misconfigured');
        return;
    }

    const token = bearerToken(req);
    if (!token) {
        reject(res, 401, 'unauthorized');
        return;
    }

    let session;
    try {
        session = await verifySession(token);
    } catch {
        reject(res, 401, 'unauthorized');
        return;
    }

    if (!isEmailAllowed(session.email)) {
        reject(res, 403, 'not_allowed');
        return;
    }

    const limits = getDailyLimits();
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
    let validatedImageCount = 0;
    try {
        messages = buildMessages(isTest ? { prompt: 'Reply with the single word: OK' } : req.body);
        validatedImageCount = isTest ? 0 : validateImages(req.body?.images).length;
    } catch (error) {
        console.warn('[ai/chat] bad request:', error?.message || error);
        reject(res, 400, 'bad_request');
        return;
    }

    const promptEstimate = estimateTokens(isTest ? 'OK' : req.body?.prompt || '');
    const reservedTokens = promptEstimate + maxTokens + 1000 * validatedImageCount;

    let releaseConcurrency = null;
    let reserved = false;
    let reservedTokenAmount = 0;
    let actualTokens = promptEstimate;

    try {
        if (!(await checkMinuteRateLimit(session.sub))) {
            reject(res, 429, 'rate_limited');
            return;
        }

        releaseConcurrency = await acquireConcurrency(session.sub);
        if (!releaseConcurrency) {
            reject(res, 429, 'concurrency_limited');
            return;
        }

        const reservation = await reserveDailyUsage(session.sub, {
            tokenReserve: reservedTokens,
            limits,
        });
        if (!reservation.ok) {
            reject(res, 429, 'rate_limited');
            return;
        }
        reserved = true;
        reservedTokenAmount = reservation.reservedTokens;

        const streamRequested = !isTest && req.body?.stream !== false;
        const startedAt = Date.now();

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
            actualTokens = promptEstimate + estimateTokens(full);
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
        actualTokens = promptEstimate + estimateTokens(outText);
    } catch (error) {
        if (error instanceof StoreMisconfiguredError) {
            console.error('[ai/chat] store:', error.message);
            if (!res.headersSent) {
                reject(res, 503, 'misconfigured');
            }
            return;
        }
        const upstreamStatus = error instanceof UpstreamError ? error.status : null;
        const reason = error?.message || 'Unknown error';
        console.error(
            `[ai/chat] upstream failed: status=${upstreamStatus} model=${error?.model || primary} ${reason}`,
        );
        if (!res.headersSent) {
            res.status(502).json({
                error: 'upstream_failed',
                message: MSG.upstream_failed,
            });
        } else {
            res.end();
        }
    } finally {
        if (releaseConcurrency) {
            await releaseConcurrency();
        }
        if (reserved) {
            const tokenDelta = actualTokens - reservedTokenAmount;
            try {
                await reconcileDailyUsage(session.sub, { tokenDelta });
            } catch (error) {
                console.error('[ai/chat] reconcile failed:', error?.message || error);
            }
        }
    }
}
