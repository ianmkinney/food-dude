// Local check of /api/ai/chat with a fake owner session and a stubbed OpenRouter.
// Run: node scripts/test-owner-api.mjs   (no network, no real keys)
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'local-test-secret';
process.env.OPENROUTER_API_KEY = 'sk-or-fake';
process.env.ALLOWED_EMAILS = 'owner@example.com';
process.env.OPENROUTER_DEFAULT_MODEL = 'google/gemini-2.0-flash-001';

const { signSession } = await import('../api/_lib/session.js');
const { default: chat } = await import('../api/ai/chat.js');

const retired = new Set(['google/gemini-2.0-flash-001']);
let upstreamMode = 'ok';
const upstreamCalls = [];
globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer sk-or-fake');
    const { model } = JSON.parse(init.body);
    upstreamCalls.push(model);
    if (upstreamMode === 'down') throw new TypeError('fetch failed');
    if (upstreamMode === 'badkey') {
        return new Response(JSON.stringify({ error: { message: 'No auth credentials found', code: 401 } }), { status: 401 });
    }
    if (retired.has(model)) {
        return new Response(JSON.stringify({ error: { message: `${model} is not a valid model ID`, code: 400 } }), { status: 400 });
    }
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: 'OK' } }] })}\n\ndata: [DONE]\n\n`;
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
assert.match(r.body.message, /No owner session/);
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

r = await call({ token: owner, body: { test: true } });
assert.equal(r.status, 200);
assert.equal(typeof r.body.latencyMs, 'number');
console.log('test mode       ->', r.status, r.body);

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
