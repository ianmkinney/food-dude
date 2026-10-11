import { applyCors } from '../_lib/cors.js';
import {
    getOpenRouterConfig,
    isEmailAllowed,
    isOwnerGateConfigured,
    requireSecrets,
    resolveOpenRouterApiKey,
} from '../_lib/env.js';
import { bearerToken, verifySession } from '../_lib/session.js';
import { checkMinuteRateLimit } from '../_lib/store.js';
import { ENHANCE_DEFAULT_MODEL, runEnhanceBodyPhase, runEnhanceNutritionPhase } from '../_lib/recipeEnhancePhases.js';

export const config = {
    maxDuration: 60,
};

const MSG = {
    method_not_allowed: 'Method not allowed.',
    platform_disabled: 'Owner platform AI is not enabled.',
    misconfigured: 'Server configuration error.',
    unauthorized: 'Sign in again in Account.',
    not_allowed: 'This Google account is not authorized.',
    no_platform_key: 'No platform AI key is configured for this account.',
    rate_limited: 'Too many requests. Wait a moment and try again.',
    bad_request: 'Invalid request.',
    upstream_failed: 'AI request failed. Try again later.',
};

function reject(res, status, error, extra = {}) {
    res.status(status).json({ error, message: MSG[error] || 'Request failed.', ...extra });
}

function resolveEnhanceModel(body) {
    if (body?.useOwnerChatModel && typeof body?.model === 'string' && body.model.trim()) {
        return body.model.trim();
    }
    return ENHANCE_DEFAULT_MODEL;
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
    } catch {
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

    const apiKey = resolveOpenRouterApiKey(session.email);
    if (!apiKey) {
        reject(res, 503, 'no_platform_key');
        return;
    }

    if (!checkMinuteRateLimit(`enhance:${session.sub}`, 12)) {
        reject(res, 429, 'rate_limited');
        return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const phase = String(body.phase || '');
    const recipe = body.recipe;
    if (!recipe || typeof recipe !== 'object' || !recipe.title) {
        reject(res, 400, 'bad_request');
        return;
    }

    const model = resolveEnhanceModel(body);
    const testDelayMs =
        process.env.ENHANCE_TEST_DELAY_MS && process.env.NODE_ENV !== 'production'
            ? Number(process.env.ENHANCE_TEST_DELAY_MS)
            : 0;

    try {
        getOpenRouterConfig();
        const started = Date.now();
        if (phase === 'body') {
            const result = await runEnhanceBodyPhase({
                apiKey,
                model,
                recipe,
                customInstructions: body.customInstructions,
                testDelayMs,
            });
            res.status(200).json({ ok: true, phase: 'body', model, latencyMs: Date.now() - started, ...result });
            return;
        }
        if (phase === 'nutrition') {
            const bodyRecipe = body.bodyRecipe;
            if (!bodyRecipe || typeof bodyRecipe !== 'object') {
                reject(res, 400, 'bad_request');
                return;
            }
            const result = await runEnhanceNutritionPhase({
                apiKey,
                model,
                recipe,
                bodyRecipe,
                customInstructions: body.customInstructions,
                testDelayMs,
            });
            res.status(200).json({ ok: true, phase: 'nutrition', model, latencyMs: Date.now() - started, ...result });
            return;
        }
        reject(res, 400, 'bad_request');
    } catch (error) {
        console.error('[ai/enhance-recipe]', phase, error?.message || error);
        res.status(502).json({
            error: 'upstream_failed',
            message: error?.message || MSG.upstream_failed,
            upstreamStatus: error?.status || 0,
        });
    }
}
