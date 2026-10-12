import { applyCors } from '../_lib/cors.js';
import {
    getOpenRouterConfig,
    isEmailAllowed,
    isOwnerGateConfigured,
    requireSecrets,
    resolveOpenRouterApiKey,
} from '../_lib/env.js';
import { bearerToken, verifySession } from '../_lib/session.js';
import {
    IMAGE_REQUESTS_PER_MINUTE,
    OpenRouterImageError,
    openRouterGenerateImage,
    validateImagePrompt,
} from '../_lib/openRouterImage.js';
import { checkMinuteRateLimit } from '../_lib/store.js';
import { handleElevenLabsMode } from '../_lib/elevenLabs.js';
import {
    fetchOpenRouterModelCatalog,
    getPlatformModelDefaults,
    isAmpiChatCatalogModel,
    isImageCatalogModel,
    resolveOwnerChatModelForVision,
    resolveOwnerImageModel,
    toPublicModelRow,
} from '../_lib/openRouterModels.js';
import { buildOpenRouterMessages, bodyHasImages } from '../_lib/chatOpenRouterMessages.js';
import { fetchOpenRouterStats } from '../_lib/openRouterStats.js';
import {
    buildAmpiOpenRouterBody,
    completeAmpiTurn,
    AmpiUpstreamError,
    pickAmpiStrategy,
} from '../_lib/ampiModelAdapter.js';

const DAILY_CREDIT_MSG = 'Daily AI limit reached. Try again tomorrow or ask Ian to raise your OpenRouter credit limit.';

const MSG = {
    method_not_allowed: 'Method not allowed.',
    platform_disabled: 'Owner platform AI is not enabled.',
    misconfigured: 'Server configuration error.',
    unauthorized: 'Sign in again in Account.',
    not_allowed: 'This Google account is not authorized.',
    no_platform_key: 'No platform AI key is configured for this account.',
    rate_limited: 'Too many requests. Wait a moment and try again.',
    credit_limit: DAILY_CREDIT_MSG,
    bad_request: 'Invalid request.',
    upstream_failed: 'AI request failed. Try again later.',
};

const IMAGE_MIME = /^image\/(png|jpeg|webp|gif)$/;
const MAX_IMAGES = 6;
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

const MAX_TOTAL_IMAGE_BYTES = 4.5 * 1024 * 1024;

function validateMultimodalBody(body) {
    const images = [];
    if (Array.isArray(body?.images)) images.push(...body.images);
    if (Array.isArray(body?.turns)) {
        for (const turn of body.turns) {
            if (Array.isArray(turn?.images)) images.push(...turn.images);
        }
    }
    if (images.length > MAX_IMAGES) {
        throw new Error(`Too many images (max ${MAX_IMAGES}).`);
    }
    let bytes = 0;
    for (const img of images) {
        const len = String(img?.data || '').length;
        bytes += Math.floor(len * 0.75);
    }
    if (bytes > MAX_TOTAL_IMAGE_BYTES) {
        throw new Error('Attachment payload is too large. Send fewer or smaller images.');
    }
}

function normalizeBodyImages(body) {
    if (!body || typeof body !== 'object') return body;
    const out = { ...body };
    if (Array.isArray(body.images)) {
        out.images = validateImages(body.images);
    }
    if (Array.isArray(body.turns)) {
        out.turns = body.turns.map((turn) => ({
            ...turn,
            images: turn.images ? validateImages(turn.images) : undefined,
        }));
    }
    return out;
}

function buildMessages(body) {
    return buildOpenRouterMessages(body);
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

const shouldTryNextModel = (error, hasMore) => {
    if (!hasMore || !(error instanceof UpstreamError)) return false;
    if (error.status === 400 || error.status === 404 || error.status === 422) return true;
    return /model/i.test(error.message || '');
};

async function openRouterStream({ apiKey, model, messages, maxTokens, extraBody }) {
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
                ...(extraBody || null),
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

async function openRouterWithFallback({ apiKey, models, messages, maxTokens, extraBodyForModel }) {
    let lastError;
    const failures = [];
    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const hasMore = i < models.length - 1;
        const extraBody = extraBodyForModel ? extraBodyForModel(model) : null;
        try {
            return {
                upstream: await openRouterStream({ apiKey, model, messages, maxTokens, extraBody }),
                model,
                failures,
            };
        } catch (error) {
            lastError = error;
            if (error instanceof UpstreamError) {
                failures.push({ model, status: error.status, message: error.message });
            }
            if (!shouldTryNextModel(error, hasMore)) throw error;
            console.warn(`[ai/chat] model rejected by OpenRouter: ${model} (${error.status}) ${error.message}`);
        }
    }
    throw lastError;
}

function modelFallbackNote(failures, model) {
    if (!failures?.length || !model) return null;
    const first = failures[0];
    if (!first?.model || first.model === model) return null;
    const detail = first.message ? `: ${first.message}` : '';
    return `${first.model} failed${detail}. Using ${model} instead.`;
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

    const mode = req.body?.mode;
    if (mode === 'voices' || mode === 'tts') {
        await handleElevenLabsMode(req, res, session, mode);
        return;
    }

    const apiKey = resolveOpenRouterApiKey(session.email);
    if (!apiKey) {
        reject(res, 403, 'no_platform_key');
        return;
    }

    if (mode === 'models') {
        try {
            const catalog = await fetchOpenRouterModelCatalog(apiKey);
            const defaults = getPlatformModelDefaults();
            res.status(200).json({
                defaults,
                chatModels: catalog.models.filter(isAmpiChatCatalogModel).map(toPublicModelRow),
                imageModels: catalog.models.filter(isImageCatalogModel).map(toPublicModelRow),
            });
        } catch (error) {
            console.error('[ai/chat] models list failed:', error?.message || error);
            res.status(502).json({
                error: 'upstream_failed',
                message: MSG.upstream_failed,
            });
        }
        return;
    }

    if (mode === 'stats') {
        try {
            const stats = await fetchOpenRouterStats({
                email: session.email,
                apiKey,
                refresh: Boolean(req.body?.refresh),
            });
            res.status(200).json(stats);
        } catch (error) {
            console.error('[ai/chat] stats failed:', error?.message || error);
            res.status(502).json({
                error: 'upstream_failed',
                message: MSG.upstream_failed,
            });
        }
        return;
    }

    if (req.body?.mode === 'image') {
        let prompt;
        try {
            prompt = validateImagePrompt(req.body?.prompt);
        } catch (error) {
            console.warn('[ai/chat] image bad request:', error?.message || error);
            reject(res, 400, 'bad_request');
            return;
        }

        if (!checkMinuteRateLimit(`image:${session.sub}`, IMAGE_REQUESTS_PER_MINUTE)) {
            reject(res, 429, 'rate_limited');
            return;
        }

        const { model } = await resolveOwnerImageModel(req.body?.model, apiKey);
        const startedAt = Date.now();

        try {
            const { imageUri } = await openRouterGenerateImage({ apiKey, model, prompt });
            res.status(200).json({
                imageUri,
                model,
                latencyMs: Date.now() - startedAt,
            });
        } catch (error) {
            const upstreamStatus = error instanceof OpenRouterImageError ? error.status : null;
            const reason = error?.message || 'Unknown error';
            console.error(
                `[ai/chat] image upstream failed: status=${upstreamStatus} model=${error?.model || model} ${reason}`,
            );
            if (upstreamStatus === 402) {
                reject(res, 429, 'credit_limit');
                return;
            }
            res.status(502).json({
                error: 'upstream_failed',
                message: MSG.upstream_failed,
            });
        }
        return;
    }

    const isTest = req.body?.test === true;
    const hasImages = !isTest && bodyHasImages(req.body);
    const { primary, fallbackModels, visionNote } = await resolveOwnerChatModelForVision({
        requested: req.body?.model,
        apiKey,
        hasImages,
    });
    const models = [primary, ...fallbackModels.filter((m) => m !== primary)];
    const maxTokens = isTest
        ? 16
        : Math.min(8192, Math.max(256, Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS || 4096)));

    let messages;
    try {
        if (!isTest) validateMultimodalBody(req.body);
        const normalized = isTest ? { prompt: 'Reply with the single word: OK' } : normalizeBodyImages(req.body);
        messages = buildMessages(normalized);
    } catch (error) {
        console.warn('[ai/chat] bad request:', error?.message || error);
        reject(res, 400, 'bad_request');
        return;
    }

    if (!checkMinuteRateLimit(session.sub)) {
        reject(res, 429, 'rate_limited');
        return;
    }

    const streamRequested = !isTest && req.body?.stream !== false;
    const startedAt = Date.now();
    const wantsStructured =
        req.body?.feature === 'chat' ||
        req.body?.feature === 'partyChat' ||
        (isTest && req.body?.validateAmpi === true);

    try {
        if (wantsStructured && !streamRequested) {
            const catalog = await fetchOpenRouterModelCatalog(apiKey);
            const getModelRow = (id) => catalog.byId.get(id);
            const { text, model, failures, strategy } = await completeAmpiTurn({
                apiKey,
                models,
                messages,
                maxTokens,
                getModelRow,
            });
            const fallbackNote = modelFallbackNote(failures, model);
            res.status(200).json({
                text,
                model,
                ampiStrategy: strategy,
                ...(visionNote ? { visionNote } : null),
                ...(model !== primary ? { fallbackFrom: primary } : null),
                ...(fallbackNote ? { modelFallbackNote: fallbackNote } : null),
                ...(failures?.length
                    ? { upstreamErrors: failures.map((f) => ({ model: f.model, message: f.message })) }
                    : null),
                ...(isTest ? { latencyMs: Date.now() - startedAt } : null),
            });
            return;
        }

        const catalog = wantsStructured ? await fetchOpenRouterModelCatalog(apiKey) : null;
        const getModelRow = catalog ? (id) => catalog.byId.get(id) : () => undefined;
        const extraBodyForModel = wantsStructured
            ? (model) => {
                  const strategy = pickAmpiStrategy(getModelRow(model));
                  const built = buildAmpiOpenRouterBody({
                      model,
                      messages,
                      maxTokens,
                      strategy,
                      stream: true,
                  });
                  const { model: _m, messages: _msg, max_tokens: _t, stream: _s, ...rest } = built;
                  return rest;
              }
            : null;

        const { upstream, model, failures } = await openRouterWithFallback({
            apiKey,
            models,
            messages,
            maxTokens,
            extraBodyForModel,
        });
        const fallbackNote = modelFallbackNote(failures, model);

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
            res.status(200).json({
                text: full,
                model,
                ...(visionNote ? { visionNote } : null),
                ...(model !== primary ? { fallbackFrom: primary } : null),
                ...(fallbackNote ? { modelFallbackNote: fallbackNote } : null),
                ...(failures?.length
                    ? { upstreamErrors: failures.map((f) => ({ model: f.model, message: f.message })) }
                    : null),
                ...(isTest ? { latencyMs: Date.now() - startedAt } : null),
            });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        if (fallbackNote) {
            res.write(`event: amplifood-meta\ndata: ${JSON.stringify({ modelFallbackNote: fallbackNote, model })}\n\n`);
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                res.write(`${line}\n`);
            }
        }
        res.end();
    } catch (error) {
        const upstreamStatus =
            error instanceof UpstreamError || error instanceof AmpiUpstreamError ? error.status : null;
        const reason = error?.message || 'Unknown error';
        console.error(
            `[ai/chat] upstream failed: status=${upstreamStatus} model=${error?.model || primary} ${reason}`,
        );
        if (!res.headersSent) {
            if (upstreamStatus === 402) {
                reject(res, 429, 'credit_limit');
                return;
            }
            res.status(502).json({
                error: 'upstream_failed',
                message: reason
                    ? upstreamStatus != null && upstreamStatus > 0
                        ? `OpenRouter ${upstreamStatus}: ${reason}`
                        : reason
                    : MSG.upstream_failed,
                ...(upstreamStatus != null && upstreamStatus > 0 ? { upstreamStatus } : {}),
            });
        } else {
            res.end();
        }
    }
}
