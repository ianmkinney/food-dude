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
    '_lib/elevenLabs.js',
    'auth/google.js',
    'auth/session.js',
    'ai/chat.js',
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
        rel === 'p.js' ||
        rel === 'p-og.js'
    ) {
        if (typeof mod.default !== 'function') {
            throw new Error(`${rel}: missing default export handler`);
        }
    }
    console.log('ok', rel);
}

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

const onDisk = listApiJsFiles(apiRoot);
const missing = onDisk.filter((rel) => !modules.includes(rel));
if (missing.length) {
    throw new Error(`Add API smoke imports for: ${missing.join(', ')}`);
}
console.log(`ok all ${onDisk.length} api/*.js modules listed`);

console.log('All API modules loaded.');
