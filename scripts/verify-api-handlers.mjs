#!/usr/bin/env node
/**
 * Smoke-load Vercel /api handlers and shared libs under Node ESM (matches Node 24 on Vercel).
 */
import { pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'api');

function listApiJsFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            out.push(...listApiJsFiles(full));
        } else if (name.endsWith('.js')) {
            out.push(relative(apiRoot, full).split('\\').join('/'));
        }
    }
    return out.sort();
}

const modules = [
    '_lib/cors.js',
    '_lib/env.js',
    '_lib/session.js',
    '_lib/google.js',
    '_lib/store.js',
    '_lib/openRouterImage.js',
    '_lib/openRouterModels.js',
    '_lib/openRouterStats.js',
    '_lib/chatOpenRouterMessages.js',
    '_lib/openRouterChatJson.js',
    '_lib/recipeEnhancePhases.js',
    '_lib/elevenLabs.js',
    '_lib/elevenLabsPronunciation.js',
    'auth/google.js',
    'auth/session.js',
    'ai/chat.js',
    'ai/enhance-recipe.js',
    '_lib/ssrf.js',
    '_lib/recipeExtract.js',
    '_lib/instagramImport.js',
    '_lib/tiktokImport.js',
    '_lib/socialImportRespond.js',
    '_lib/importVideoShared.js',
    '_lib/recipeVideoAi.js',
    'recipes/import.js',
    'party/email.js',
    'party/index.js',
    'backup/index.js',
    '_lib/partyDb.js',
    '_lib/partySchema.js',
    '_lib/partyConstants.js',
    '_lib/partyImageSniff.js',
    '_lib/partyRateLimit.js',
    '_lib/partyTxn.js',
    '_lib/partyInvite.js',
    '_lib/partyTokens.js',
    '_lib/partyHttp.js',
    '_lib/partySerialize.js',
    '_lib/partyBlob.js',
    '_lib/partyOgRender.js',
    '_lib/syncCrypto.js',
    '_lib/syncMerge.js',
    '_lib/syncConstants.js',
    '_lib/syncStore.js',
    '_lib/authTestMode.js',
    '_lib/partyMembers.js',
    '_lib/ampiResponseSchema.js',
    '_lib/ampiResponseParse.js',
    '_lib/ampiActionSchema.js',
    '_lib/ampiCompletionExtract.js',
    '_lib/ampiActionNormalize.js',
    '_lib/ampiModelAdapter.js',
    '_lib/httpJson.js',
    '_lib/parseRecipeJson.js',
    '_lib/recipeTextExtract.js',
    '_lib/recipeTitle.js',
    '_lib/ampiToolNormalize.js',
    '_lib/partyAmpiReply.js',
    '_lib/partyAmpiTurn.js',
    '_lib/recipeNormalize.js',
    '_lib/partyChat.js',
    'p.js',
    'p-og.js',
];

for (const rel of modules) {
    const url = pathToFileURL(join(apiRoot, rel)).href;
    const mod = await import(url);
    if (
        rel.startsWith('auth/') ||
        rel.startsWith('ai/') ||
        rel.startsWith('recipes/') ||
        rel.startsWith('party/') ||
        rel.startsWith('backup/') ||
        rel === 'p.js' ||
        rel === 'p-og.js'
    ) {
        if (typeof mod.default !== 'function' && typeof mod.GET !== 'function') {
            throw new Error(`${rel}: missing default export handler`);
        }
    }
    console.log('ok', rel);
}

const { renderPartyOgPng } = await import(pathToFileURL(join(apiRoot, '_lib/partyOgRender.js')).href);
const ogSample = await renderPartyOgPng({ title: 'Test Party' });
if (!ogSample?.length || ogSample.length < 500) {
    throw new Error('partyOgRender: expected non-empty PNG buffer');
}
console.log('ok party OG render', ogSample.length, 'bytes');

const { checkMinuteRateLimit } = await import(pathToFileURL(join(apiRoot, '_lib/store.js')).href);
for (let i = 0; i < 10; i++) {
    if (!checkMinuteRateLimit('verify-user')) {
        throw new Error('rate limit should allow 10 per minute');
    }
}
if (checkMinuteRateLimit('verify-user')) {
    throw new Error('rate limit should block 11th request');
}
console.log('ok in-memory rate limit');

for (let i = 0; i < 5; i++) {
    if (!checkMinuteRateLimit('verify-image-user', 5)) {
        throw new Error('image rate limit should allow 5 per minute');
    }
}
if (checkMinuteRateLimit('verify-image-user', 5)) {
    throw new Error('image rate limit should block 6th request');
}
console.log('ok image rate limit');

process.env.ALLOWED_EMAILS = 'owner@example.com,tester@example.com';
process.env.OWNER_EMAIL = 'owner@example.com';
process.env.OPENROUTER_API_KEY = 'sk-or-owner';
process.env.OPENROUTER_KEYS_JSON = JSON.stringify({ 'tester@example.com': 'sk-or-tester' });
const { resolveOpenRouterApiKey } = await import(pathToFileURL(join(apiRoot, '_lib/env.js')).href);
if (resolveOpenRouterApiKey('tester@example.com') !== 'sk-or-tester') {
    throw new Error('per-tester key mismatch');
}
if (resolveOpenRouterApiKey('owner@example.com') !== 'sk-or-owner') {
    throw new Error('owner fallback key mismatch');
}
if (resolveOpenRouterApiKey('other@example.com') !== null) {
    throw new Error('unexpected key for unknown email');
}
console.log('ok openrouter key resolution');

const { isElevenLabsConfigured, resolveElevenLabsApiKey } = await import(
    pathToFileURL(join(apiRoot, '_lib/elevenLabs.js')).href
);
if (resolveElevenLabsApiKey('') !== null || resolveElevenLabsApiKey('  ') !== null) {
    throw new Error('elevenlabs key should reject empty');
}
if (resolveElevenLabsApiKey('REPLACE_ME') !== null || resolveElevenLabsApiKey('replace_me') !== null) {
    throw new Error('elevenlabs key should reject placeholder');
}
if (resolveElevenLabsApiKey('sk-real-key') !== 'sk-real-key') {
    throw new Error('elevenlabs key should accept real key');
}
process.env.ELEVENLABS_API_KEY = 'REPLACE_ME';
if (isElevenLabsConfigured()) {
    throw new Error('elevenlabs should be unconfigured for REPLACE_ME');
}
process.env.ELEVENLABS_API_KEY = 'xi-test-key';
if (!isElevenLabsConfigured()) {
    throw new Error('elevenlabs should be configured for real key');
}
delete process.env.ELEVENLABS_API_KEY;
console.log('ok elevenlabs key resolution');

{
    const { handleElevenLabsMode, stripAudioTags } = await import(pathToFileURL(join(apiRoot, '_lib/elevenLabs.js')).href);
    if (stripAudioTags('[warmly] Hi there [laughs]. See [the recipe](https://x.y)') !== 'Hi there. See [the recipe](https://x.y)') {
        throw new Error('stripAudioTags should drop tags but keep links');
    }
    process.env.ELEVENLABS_API_KEY = 'xi-test-key';
    const realFetch = globalThis.fetch;
    const calls = [];
    let failV4 = false;
    let failAll = false;
    globalThis.fetch = async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push({ url: String(url), model: body.model_id, text: body.text });
        if (failAll || (failV4 && body.model_id === 'eleven_v4')) {
            return new Response(JSON.stringify({ detail: { status: 'quota_exceeded', message: 'Quota exceeded.' } }), { status: 401 });
        }
        return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    };
    const run = async (text, sub) => {
        const res = {
            headers: {},
            statusCode: 0,
            body: null,
            setHeader(k, v) {
                this.headers[k.toLowerCase()] = v;
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            send(b) {
                this.body = b;
            },
            json(b) {
                this.body = b;
            },
        };
        await handleElevenLabsMode({ body: { voiceId: 'voice_12345678', text } }, res, { sub }, 'tts');
        return res;
    };
    try {
        let res = await run('[excited] Dinner is ready!', 'verify-tts-1');
        if (res.statusCode !== 200 || res.headers['x-elevenlabs-model'] !== 'eleven_v4' || calls.at(-1).text !== '[excited] Dinner is ready!') {
            throw new Error(`tagged text should use eleven_v4 with tags: ${JSON.stringify({ status: res.statusCode, calls })}`);
        }
        if (res.headers['content-type'] !== 'audio/mpeg' || !res.body?.length) throw new Error('tts should return audio/mpeg bytes');
        failV4 = true;
        res = await run('[excited] Dinner is ready!', 'verify-tts-2');
        const last = calls.at(-1);
        if (res.statusCode !== 200 || last.model === 'eleven_v4') {
            throw new Error(`v4 failure should fall back to another model: ${JSON.stringify(last)}`);
        }
        failV4 = false;
        res = await run('Plain text.', 'verify-tts-3');
        if (res.statusCode !== 200 || res.headers['x-elevenlabs-model'] !== 'eleven_v4') {
            throw new Error(`untagged text should use eleven_v4: ${JSON.stringify({ status: res.statusCode, model: res.headers['x-elevenlabs-model'] })}`);
        }
        failAll = true;
        res = await run('Plain text.', 'verify-tts-4');
        if (res.statusCode !== 502 || !/Quota exceeded/.test(res.body?.detail || '')) {
            throw new Error(`upstream errors should pass ElevenLabs detail back: ${JSON.stringify(res.body)}`);
        }
    } finally {
        globalThis.fetch = realFetch;
        delete process.env.ELEVENLABS_API_KEY;
    }
    console.log('ok elevenlabs tts model choice, fallback and error detail');
}

{
    process.env.SYNC_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const { encryptSyncPayload, decryptSyncPayload } = await import(
        pathToFileURL(join(apiRoot, '_lib/syncCrypto.js')).href
    );
    const payload = { title: 'Test', calories: 12 };
    const cipher = encryptSyncPayload('user-sub-1', payload);
    const round = decryptSyncPayload('user-sub-1', cipher);
    if (round.title !== 'Test' || round.calories !== 12) {
        throw new Error('sync crypto round-trip failed');
    }
    const { incomingWins, mergePushBatch } = await import(pathToFileURL(join(apiRoot, '_lib/syncMerge.js')).href);
    if (!incomingWins(null, { updatedAtMs: 1, deviceId: 'a' })) {
        throw new Error('incomingWins expected true for empty server');
    }
    const m = mergePushBatch(new Map(), [
        { collection: 'recipes', recordId: '9', updatedAtMs: 1, deviceId: 'd', deleted: false, payload: {} },
    ]);
    if (m.accepted.length !== 1) throw new Error('mergePushBatch should accept first record');
    console.log('ok sync crypto and merge');
    delete process.env.SYNC_ENCRYPTION_KEY;
}

{
    process.env.ALLOWED_EMAILS = 'owner@example.com,ikinney51@gmail.com';
    const { isLocalAuthTestModeEnabled, tryResolveAuthTestProfile, AUTH_TEST_ID_TOKEN, AUTH_TEST_NONCE } =
        await import(pathToFileURL(join(apiRoot, '_lib/authTestMode.js')).href);

    const saved = {
        AUTH_TEST_MODE: process.env.AUTH_TEST_MODE,
        VERCEL_ENV: process.env.VERCEL_ENV,
        NODE_ENV: process.env.NODE_ENV,
    };
    try {
        process.env.AUTH_TEST_MODE = '1';
        delete process.env.VERCEL_ENV;
        process.env.NODE_ENV = 'test';
        if (!isLocalAuthTestModeEnabled()) throw new Error('auth test mode should be enabled locally');
        const ok = tryResolveAuthTestProfile({
            idToken: AUTH_TEST_ID_TOKEN,
            nonce: AUTH_TEST_NONCE,
            testEmail: 'stranger@example.com',
        });
        if (!ok || ok.email !== 'stranger@example.com') throw new Error('auth test profile for non-allowlisted email');
        let blocked = false;
        try {
            tryResolveAuthTestProfile({
                idToken: AUTH_TEST_ID_TOKEN,
                nonce: AUTH_TEST_NONCE,
                testEmail: 'owner@example.com',
            });
        } catch (e) {
            blocked = e?.code === 'auth_test_allowlisted_forbidden';
        }
        if (!blocked) throw new Error('auth test mode must reject allowlisted emails');

        process.env.VERCEL_ENV = 'production';
        if (isLocalAuthTestModeEnabled()) throw new Error('auth test mode must be off when VERCEL_ENV is set');
        if (
            tryResolveAuthTestProfile({
                idToken: AUTH_TEST_ID_TOKEN,
                nonce: AUTH_TEST_NONCE,
                testEmail: 'stranger@example.com',
            }) !== null
        ) {
            throw new Error('auth test profile must be null on Vercel');
        }

        delete process.env.VERCEL_ENV;
        process.env.NODE_ENV = 'production';
        if (isLocalAuthTestModeEnabled()) throw new Error('auth test mode must be off when NODE_ENV=production');
    } finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
    console.log('ok auth test mode local-only and allowlist guard');
}

const onDisk = listApiJsFiles(apiRoot);
const missing = onDisk.filter((rel) => !modules.includes(rel));
if (missing.length) {
    throw new Error(`Add API smoke imports for: ${missing.join(', ')}`);
}
console.log(`ok all ${onDisk.length} api/*.js modules listed`);

console.log('All API modules loaded.');
