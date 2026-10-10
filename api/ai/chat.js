const { applyCors } = require('../lib/cors');
const {
    estimateTokens,
    getDailyLimits,
    getOpenRouterConfig,
    isEmailAllowed,
    isOwnerGateConfigured,
    requireSecrets,
} = require('../lib/env');
const { bearerToken, verifySession } = require('../lib/session');
const { getUsage, recordUsage } = require('../lib/store');

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

async function openRouterStream({ model, messages, maxTokens }) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `OpenRouter error ${response.status}`);
    }
    return response;
}

module.exports = async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'method_not_allowed' });
        return;
    }

    if (!isOwnerGateConfigured()) {
        res.status(503).json({
            error: 'platform_disabled',
            message: 'Owner platform AI is not enabled (ALLOWED_EMAILS is required).',
        });
        return;
    }

    try {
        requireSecrets();
    } catch (error) {
        res.status(503).json({ error: 'misconfigured', message: error.message });
        return;
    }

    const token = bearerToken(req);
    if (!token) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }

    let session;
    try {
        session = await verifySession(token);
    } catch {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }

    if (!isEmailAllowed(session.email)) {
        res.status(403).json({ error: 'not_allowed' });
        return;
    }

    const limits = getDailyLimits();
    const usage = await getUsage(session.sub);
    if (usage.requests >= limits.maxRequests || usage.tokens >= limits.maxTokens) {
        res.status(429).json({ error: 'rate_limited', message: FRIENDLY_LIMIT });
        return;
    }

    const { defaultModel, allowedModels } = getOpenRouterConfig();
    const requested = req.body?.model;
    const model =
        requested && allowedModels.includes(requested) ? requested : defaultModel;
    const maxTokens = Math.min(
        8192,
        Math.max(256, Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS || 4096))
    );

    let messages;
    try {
        messages = buildMessages(req.body);
    } catch (error) {
        res.status(400).json({ error: 'bad_request', message: error.message });
        return;
    }

    const promptEstimate = estimateTokens(req.body?.prompt || '');
    if (usage.tokens + promptEstimate > limits.maxTokens) {
        res.status(429).json({ error: 'rate_limited', message: FRIENDLY_LIMIT });
        return;
    }

    const streamRequested = req.body?.stream !== false;

    try {
        const upstream = await openRouterStream({ model, messages, maxTokens });

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
            res.status(200).json({ text: full, model });
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
        if (!res.headersSent) {
            res.status(502).json({
                error: 'upstream_failed',
                message: 'The AI service is temporarily unavailable. Try again shortly.',
            });
        } else {
            res.end();
        }
    }
};
