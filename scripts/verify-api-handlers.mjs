#!/usr/bin/env node
/**
 * Smoke-load Vercel /api handlers and shared libs under Node ESM (matches Node 24 on Vercel).
 */
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'api');

const modules = [
    'lib/cors.js',
    'lib/env.js',
    'lib/session.js',
    'lib/google.js',
    'lib/store.js',
    'auth/google.js',
    'auth/session.js',
    'ai/chat.js',
];

for (const rel of modules) {
    const url = pathToFileURL(join(apiRoot, rel)).href;
    const mod = await import(url);
    if (rel.startsWith('auth/') || rel.startsWith('ai/')) {
        if (typeof mod.default !== 'function') {
            throw new Error(`${rel}: missing default export handler`);
        }
    }
    console.log('ok', rel);
}

const { checkMinuteRateLimit } = await import(pathToFileURL(join(apiRoot, 'lib/store.js')).href);
for (let i = 0; i < 10; i++) {
    if (!checkMinuteRateLimit('verify-user')) {
        throw new Error('rate limit should allow 10 per minute');
    }
}
if (checkMinuteRateLimit('verify-user')) {
    throw new Error('rate limit should block 11th request');
}
console.log('ok in-memory rate limit');

process.env.ALLOWED_EMAILS = 'owner@example.com,tester@example.com';
process.env.OWNER_EMAIL = 'owner@example.com';
process.env.OPENROUTER_API_KEY = 'sk-or-owner';
process.env.OPENROUTER_KEYS_JSON = JSON.stringify({ 'tester@example.com': 'sk-or-tester' });
const { resolveOpenRouterApiKey } = await import(pathToFileURL(join(apiRoot, 'lib/env.js')).href);
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

console.log('All API modules loaded.');
