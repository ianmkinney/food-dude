import {
    AMPI_JSON_TURN_INSTRUCTION,
    AMPI_OPENAI_TOOLS,
    ampiStructuredResponseFormat,
} from './ampiActionSchema.js';
import { extractAmpiTurnFromCompletion, extractAmpiTurnFromText } from './ampiCompletionExtract.js';
import {
    normalizeCanonicalAmpiTurn,
    serializeCanonicalAmpiTurn,
} from './ampiActionNormalize.js';
import { modelSupportsParameter } from './openRouterModels.js';

export const AMPI_STRATEGY = {
    NATIVE_TOOLS: 'native_tools',
    JSON_SCHEMA: 'json_schema',
    PROMPT_JSON: 'prompt_json',
};

export function pickAmpiStrategy(modelRow) {
    if (modelSupportsParameter(modelRow, 'tools')) return AMPI_STRATEGY.NATIVE_TOOLS;
    if (
        modelSupportsParameter(modelRow, 'response_format') ||
        modelSupportsParameter(modelRow, 'structured_outputs')
    ) {
        return AMPI_STRATEGY.JSON_SCHEMA;
    }
    return AMPI_STRATEGY.PROMPT_JSON;
}

function injectJsonInstruction(messages) {
    const out = Array.isArray(messages) ? [...messages] : [];
    const idx = out.findIndex((m) => m.role === 'system');
    if (idx >= 0) {
        const prev = String(out[idx].content || '');
        out[idx] = {
            ...out[idx],
            content: `${prev}\n\n${AMPI_JSON_TURN_INSTRUCTION}`.trim(),
        };
        return out;
    }
    return [{ role: 'system', content: AMPI_JSON_TURN_INSTRUCTION }, ...out];
}

/**
 * Build OpenRouter chat/completions JSON body for an Ampi turn.
 */
export function buildAmpiOpenRouterBody({ model, messages, maxTokens, strategy, stream = false }) {
    const base = {
        model,
        messages: strategy === AMPI_STRATEGY.PROMPT_JSON ? injectJsonInstruction(messages) : messages,
        max_tokens: maxTokens,
        stream,
    };
    if (strategy === AMPI_STRATEGY.NATIVE_TOOLS) {
        return { ...base, tools: AMPI_OPENAI_TOOLS, tool_choice: 'auto', parallel_tool_calls: true };
    }
    if (strategy === AMPI_STRATEGY.JSON_SCHEMA) {
        return { ...base, response_format: ampiStructuredResponseFormat() };
    }
    return base;
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

export class AmpiUpstreamError extends Error {
    constructor(status, message, model) {
        super(message);
        this.name = 'AmpiUpstreamError';
        this.status = status;
        this.model = model;
    }
}

function repairMessages(messages, errors) {
    const hint = errors.slice(0, 6).join('; ');
    return [
        ...messages,
        {
            role: 'user',
            content: `Your previous assistant output had invalid tool arguments (${hint}). Reply again with valid JSON or tool calls. For update_recipe include recipe_id as a number.`,
        },
    ];
}

const shouldTryNextModel = (error, hasMore) => {
    if (!hasMore || !(error instanceof AmpiUpstreamError)) return false;
    if (error.status === 400 || error.status === 404 || error.status === 422) return true;
    return /model/i.test(error.message || '');
};

/**
 * Non-streaming Ampi completion with strategy selection, one repair retry, then model fallback.
 * @param {{ apiKey: string, models: string[], messages: object[], maxTokens: number, getModelRow: (id: string) => object | undefined, context?: object }} opts
 */
export async function completeAmpiTurn(opts) {
    const { apiKey, models, messages, maxTokens, getModelRow, context = {} } = opts;
    let lastError;
    const failures = [];

    for (let mi = 0; mi < models.length; mi++) {
        const model = models[mi];
        const hasMore = mi < models.length - 1;
        const row = getModelRow(model);
        const strategy = pickAmpiStrategy(row);
        let attemptMessages = messages;
        let repairErrors = null;

        for (let attempt = 0; attempt < 2; attempt++) {
            const body = buildAmpiOpenRouterBody({
                model,
                messages: attempt && repairErrors ? repairMessages(attemptMessages, repairErrors) : attemptMessages,
                maxTokens,
                strategy,
                stream: false,
            });

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
                });
            } catch (error) {
                throw new AmpiUpstreamError(0, `Couldn't reach OpenRouter: ${error?.message || 'network error'}`, model);
            }

            const text = await response.text().catch(() => '');
            if (!response.ok) {
                const err = new AmpiUpstreamError(response.status, upstreamMessage(response.status, text), model);
                lastError = err;
                failures.push({ model, status: err.status, message: err.message });
                if (!shouldTryNextModel(err, hasMore)) throw err;
                break;
            }

            let json;
            try {
                json = JSON.parse(text);
            } catch {
                throw new AmpiUpstreamError(response.status, 'Invalid OpenRouter JSON response', model);
            }

            const extracted = extractAmpiTurnFromCompletion(json);
            const normalized = normalizeCanonicalAmpiTurn(extracted, {
                ...context,
                reply: extracted.reply,
            });

            if (!normalized.valid && attempt === 0 && normalized.actions.length) {
                repairErrors = normalized.errors;
                attemptMessages = messages;
                continue;
            }

            const canonical = {
                reply: normalized.reply,
                actions: normalized.actions,
            };
            if (!normalized.reply && !normalized.actions.length) {
                canonical.reply = extracted.reply || '';
            }

            return {
                text: serializeCanonicalAmpiTurn(canonical),
                model: json?.model || model,
                strategy,
                failures,
                normalized: true,
                validationErrors: normalized.valid ? [] : normalized.errors,
            };
        }
        if (lastError instanceof AmpiUpstreamError && shouldTryNextModel(lastError, hasMore)) {
            console.warn(`[ampiModelAdapter] model rejected: ${model} (${lastError.status}) ${lastError.message}`);
            continue;
        }
    }
    throw lastError || new Error('Ampi completion failed');
}

/** Parse + normalize raw assistant text (party chat, BYOK). */
export function normalizeAmpiTurnFromText(rawText, context = {}) {
    const extracted = extractAmpiTurnFromText(rawText);
    const turn = normalizeCanonicalAmpiTurn(extracted, { ...context, reply: extracted.reply });
    return {
        reply: turn.reply,
        actions: turn.actions,
        parsed: turn.parsed,
        valid: turn.valid,
        errors: turn.errors,
    };
}

export { serializeCanonicalAmpiTurn };
