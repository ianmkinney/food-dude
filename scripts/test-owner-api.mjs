// Local check of /api/ai/chat with a fake owner session and a stubbed OpenRouter.
// Run: node scripts/test-owner-api.mjs   (no network, no real keys)
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'local-test-secret';
process.env.OPENROUTER_API_KEY = 'sk-or-fake';
process.env.ALLOWED_EMAILS = 'owner@example.com';
process.env.OPENROUTER_DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
process.env.OPENROUTER_PROVISIONING_KEY = 'sk-or-mgmt';

const { signSession } = await import('../api/_lib/session.js');
const { resetOpenRouterModelCache } = await import('../api/_lib/openRouterModels.js');
const { resetOpenRouterStatsCache } = await import('../api/_lib/openRouterStats.js');
const { default: chat } = await import('../api/ai/chat.js');

resetOpenRouterModelCache();
resetOpenRouterStatsCache();

const retired = new Set(['google/gemini-2.0-flash-001']);
const AMPI_PARAMS = ['tools', 'response_format', 'structured_outputs'];

const catalog = [
    {
        id: 'google/gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash (retired)',
        architecture: { output_modalities: ['text'] },
        supported_parameters: AMPI_PARAMS,
        pricing: { prompt: '0.0000001', completion: '0.0000002' },
    },
    {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        architecture: { output_modalities: ['text'] },
        supported_parameters: AMPI_PARAMS,
        pricing: { prompt: '0.00000015', completion: '0.0000006' },
    },
    {
        id: 'openai/gpt-6-luna-pro',
        name: 'GPT-6 Luna Pro',
        architecture: { output_modalities: ['text'] },
        supported_parameters: AMPI_PARAMS,
        pricing: { prompt: '0.000001', completion: '0.000002' },
    },
    {
        id: 'google/gemini-2.5-flash-image',
        name: 'Gemini 2.5 Flash Image',
        architecture: { output_modalities: ['image', 'text'] },
        pricing: { prompt: '0.0000003', completion: '0.0000003' },
    },
    {
        id: 'evil/not-in-catalog',
        name: 'Evil',
        architecture: { output_modalities: ['text'] },
        pricing: { prompt: '0', completion: '0' },
    },
];

let upstreamMode = 'ok';
const upstreamCalls = [];
globalThis.fetch = async (url, init) => {
    if (url === 'https://openrouter.ai/api/v1/models') {
        assert.equal(init.headers.Authorization, 'Bearer sk-or-fake');
        return new Response(JSON.stringify({ data: catalog }), { status: 200 });
    }
    if (url === 'https://openrouter.ai/api/v1/credits') {
        assert.equal(init.headers.Authorization, 'Bearer sk-or-fake');
        return new Response(JSON.stringify({ data: { total_credits: 10, total_usage: 2.5 } }), { status: 200 });
    }
    if (url === 'https://openrouter.ai/api/v1/key') {
        assert.equal(init.headers.Authorization, 'Bearer sk-or-fake');
        return new Response(
            JSON.stringify({
                data: {
                    usage_daily: 0.5,
                    usage_weekly: 1.25,
                    usage_monthly: 2.5,
                    limit: 100,
                    limit_remaining: 97.5,
                    hash: 'deadbeef',
                },
            }),
            { status: 200 }
        );
    }
    if (String(url).startsWith('https://openrouter.ai/api/v1/activity')) {
        assert.equal(init.headers.Authorization, 'Bearer sk-or-mgmt');
        return new Response(
            JSON.stringify({
                data: [
                    { date: new Date().toISOString().slice(0, 10), requests: 4 },
                    { date: '2020-01-01', requests: 99 },
                ],
            }),
            { status: 200 }
        );
    }
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer sk-or-fake');
    const body = JSON.parse(init.body);
    const { model } = body;
    upstreamCalls.push(model);
    if (model === 'openai/gpt-6-luna-pro' && (body.response_format || body.tools?.length)) {
        return new Response(JSON.stringify({ error: { message: 'Provider returned error' } }), { status: 400 });
    }
    if (upstreamMode === 'down') throw new TypeError('fetch failed');
    if (upstreamMode === 'badkey') {
        return new Response(JSON.stringify({ error: { message: 'No auth credentials found', code: 401 } }), { status: 401 });
    }
    if (retired.has(model)) {
        return new Response(JSON.stringify({ error: { message: `${model} is not a valid model ID`, code: 400 } }), { status: 400 });
    }
    const piece =
        body.response_format || body.tools?.length
            ? JSON.stringify({ reply: 'OK', actions: [] })
            : 'OK';
    if (!body.stream) {
        const message =
            body.tools?.length
                ? {
                      role: 'assistant',
                      content: piece,
                      tool_calls: [
                          {
                              id: 'call_test',
                              type: 'function',
                              function: { name: 'remember_fact', arguments: '{"fact":"ok","category":"likes"}' },
                          },
                      ],
                  }
                : { role: 'assistant', content: piece };
        return new Response(JSON.stringify({ choices: [{ message }], model }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

function call({ token, body, method = 'POST' }) {
    const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            headers: {},
            headersSent: false,
            setHeader(k, v) { this.headers[k] = v; },
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.headersSent = true; resolve({ status: this.statusCode, body: payload }); },
            end() { this.headersSent = true; resolve({ status: this.statusCode, body: null }); },
            write() { this.headersSent = true; },
        };
        chat(req, res);
    });
}

const owner = await signSession({ sub: 'g-123', email: 'owner@example.com', name: 'Owner' });
const stranger = await signSession({ sub: 'g-999', email: 'someone@example.com', name: '' });

let r = await call({ token: null, body: { prompt: 'hi' } });
assert.equal(r.status, 401);
assert.match(r.body.message, /Sign in again/i);
console.log('no token        ->', r.status, r.body.message);

r = await call({ token: 'garbage', body: { prompt: 'hi' } });
assert.equal(r.status, 401);
console.log('bad token       ->', r.status, r.body.message);

r = await call({ token: stranger, body: { prompt: 'hi' } });
assert.equal(r.status, 403);
console.log('not allowlisted ->', r.status, r.body.message);

r = await call({ token: owner, body: { prompt: 'hi', stream: false } });
assert.equal(r.status, 200);
assert.equal(r.body.text, 'OK');
assert.equal(r.body.model, 'google/gemini-2.5-flash');
assert.equal(r.body.fallbackFrom, 'google/gemini-2.0-flash-001');
console.log('retired model   ->', r.status, r.body, 'tried', upstreamCalls.splice(0));

r = await call({ token: owner, body: { mode: 'models' } });
assert.equal(r.status, 200);
assert.equal(r.body.defaults.chat, 'google/gemini-2.0-flash-001');
assert.equal(r.body.defaults.image, 'google/gemini-2.5-flash-image');
assert.ok(r.body.chatModels.some((m) => m.id === 'google/gemini-2.5-flash'));
assert.ok(r.body.chatModels.some((m) => m.id === 'evil/not-in-catalog'));
assert.ok(r.body.chatModels.some((m) => m.id === 'openai/gpt-6-luna-pro'));
assert.ok(r.body.imageModels.some((m) => m.id === 'google/gemini-2.5-flash-image'));
assert.equal(typeof r.body.chatModels[0].pricePerMillion, 'number');
console.log('models list     ->', r.status, r.body.chatModels.length, 'chat', r.body.imageModels.length, 'image');

r = await call({ token: owner, body: { mode: 'stats' } });
assert.equal(r.status, 200);
assert.equal(r.body.credits.value, 7.5);
assert.equal(r.body.spendToday.value, 0.5);
assert.equal(r.body.callsThisWeek.value, 4);
assert.ok(r.body.cachedAt);
console.log('stats           ->', r.status, r.body.credits, r.body.callsThisWeek);

r = await call({ token: owner, body: { prompt: 'hi', stream: false, model: 'google/gemini-2.5-flash' } });
assert.equal(r.status, 200);
assert.equal(upstreamCalls.at(-1), 'google/gemini-2.5-flash');
console.log('owner chat pick ->', r.status, upstreamCalls.at(-1));

upstreamCalls.length = 0;
r = await call({
    token: owner,
    body: { prompt: 'hi', stream: false, feature: 'chat', model: 'openai/gpt-6-luna-pro' },
});
assert.equal(r.status, 200);
assert.equal(r.body.model, 'google/gemini-2.5-flash');
assert.match(r.body.modelFallbackNote, /gpt-6-luna-pro/);
assert.match(r.body.modelFallbackNote, /Provider returned error/);
console.log('structured fail ->', r.body.modelFallbackNote, 'tried', upstreamCalls);

upstreamCalls.length = 0;
r = await call({ token: owner, body: { prompt: 'hi', stream: false, model: 'not-a-real-model' } });
assert.equal(r.status, 200);
assert.equal(upstreamCalls[0], 'google/gemini-2.0-flash-001');
console.log('unknown model   -> default', upstreamCalls[0]);

r = await call({ token: owner, body: { test: true, validateAmpi: true, model: 'openai/gpt-6-luna-pro' } });
assert.equal(r.status, 200);
assert.equal(typeof r.body.latencyMs, 'number');
assert.equal(r.body.model, 'google/gemini-2.5-flash');
assert.ok(r.body.modelFallbackNote);
console.log('test mode       ->', r.status, r.body.model, r.body.modelFallbackNote);

upstreamMode = 'badkey';
r = await call({ token: owner, body: { prompt: 'hi', stream: false } });
assert.equal(r.status, 502);
assert.equal(r.body.upstreamStatus, 401);
assert.match(r.body.message, /OpenRouter 401: No auth credentials found/);
console.log('bad OpenRouter key ->', r.status, r.body.message);

upstreamMode = 'down';
r = await call({ token: owner, body: { prompt: 'hi', stream: false } });
assert.equal(r.status, 502);
assert.match(r.body.message, /Couldn't reach OpenRouter/);
console.log('OpenRouter down ->', r.status, r.body.message);

console.log('\nall /api/ai/chat checks passed');
