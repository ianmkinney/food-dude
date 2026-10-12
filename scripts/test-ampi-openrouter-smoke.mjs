#!/usr/bin/env node
/**
 * Live OpenRouter smoke (owner key). Skips when OPENROUTER_API_KEY is unset.
 *
 *   OPENROUTER_API_KEY=sk-or-... node scripts/test-ampi-openrouter-smoke.mjs
 */
import assert from 'node:assert/strict';

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
    console.log('skip: set OPENROUTER_API_KEY to run live OpenRouter smoke');
    process.exit(0);
}

const { fetchOpenRouterModelCatalog } = await import('../api/_lib/openRouterModels.js');
const { completeAmpiTurn } = await import('../api/_lib/ampiModelAdapter.js');

const MODELS = [
    process.env.AMPI_SMOKE_SONNET || 'anthropic/claude-sonnet-4',
    process.env.AMPI_SMOKE_GEMINI || 'google/gemini-2.5-flash',
    process.env.AMPI_SMOKE_GPT || 'openai/gpt-4o-mini',
    process.env.AMPI_SMOKE_LLAMA || 'meta-llama/llama-3.1-8b-instruct',
].filter(Boolean);

const catalog = await fetchOpenRouterModelCatalog(apiKey);
const getModelRow = (id) => catalog.byId.get(id);

const system =
    'You are Ampi, a cooking assistant. Reply with a short confirmation only in the JSON envelope the app expects.';
const messages = [
    { role: 'system', content: system },
    {
        role: 'user',
        content:
            'Say you heard the user. actions must be empty. Do not call tools unless needed.',
    },
];

let failures = 0;
for (const model of MODELS) {
    if (!catalog.byId.has(model)) {
        console.log(`skip ${model} (not in catalog)`);
        continue;
    }
    const started = Date.now();
    try {
        const { text, strategy, validationErrors } = await completeAmpiTurn({
            apiKey,
            models: [model],
            messages,
            maxTokens: 256,
            getModelRow,
        });
        const parsed = JSON.parse(text);
        assert.ok(typeof parsed.reply === 'string');
        assert.ok(Array.isArray(parsed.actions));
        console.log(
            `ok  ${model} strategy=${strategy} ms=${Date.now() - started} reply=${parsed.reply.slice(0, 60)}`,
        );
        if (validationErrors?.length) {
            console.log('     validation:', validationErrors.join('; '));
        }
    } catch (error) {
        failures += 1;
        console.error(`FAIL ${model}:`, error?.message || error);
    }
}

if (failures) process.exit(1);
console.log('live OpenRouter smoke finished');
