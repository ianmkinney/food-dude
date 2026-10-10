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

// Exercise in-memory usage store (no KV env; dev-only fallback).
process.env.NODE_ENV = 'development';
process.env.ALLOWED_EMAILS = 'test@example.com';
const { getUsage, recordUsage } = await import(pathToFileURL(join(apiRoot, 'lib/store.js')).href);
const usage = await recordUsage('verify-user', { requestDelta: 1, tokenDelta: 10 });
if (usage.requests !== 1 || usage.tokens !== 10) {
    throw new Error('in-memory store counter mismatch');
}
console.log('ok in-memory store');

console.log('All API modules loaded.');
