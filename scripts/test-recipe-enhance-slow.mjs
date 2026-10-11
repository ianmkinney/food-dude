#!/usr/bin/env node
/**
 * Enhance API survives slow upstream (8–20s) per phase without behaving like a 10s function cap.
 */
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'api');

process.env.SESSION_SECRET = 'enhance-test-secret';
process.env.ALLOWED_EMAILS = 'owner@example.com';
process.env.OWNER_EMAIL = 'owner@example.com';
process.env.OPENROUTER_API_KEY = 'sk-or-test';
process.env.NODE_ENV = 'test';
process.env.ENHANCE_TEST_DELAY_MS = '12000';

const { signSession } = await import(pathToFileURL(join(apiRoot, '_lib/session.js')).href);
const token = await signSession({ sub: 'enhance-sub', email: 'owner@example.com', name: 'Owner' });

const bodyJson = {
    updatedRecipe: {
        servings: 4,
        prep_time: 10,
        cook_time: 20,
        total_time: 30,
        difficulty: 'easy',
        cuisine: 'american',
        description: 'Test',
        ingredients: [{ ingredient: 'salt', quantity: '1', unit: 'tsp', section: null }],
        instructions: ['Mix and serve'],
    },
    changes: [],
};

const nutritionJson = {
    nutrition: {
        servings: 4,
        calories: 220,
        protein: 8,
        carbohydrates: 30,
        fat: 6,
        fiber: 2,
        sugar: 4,
        sodium: 400,
    },
    changes: [],
};

const realFetch = globalThis.fetch;
let call = 0;
globalThis.fetch = async (url, init) => {
    if (String(url).includes('openrouter.ai')) {
        call += 1;
        const delay = 8000 + (call % 3) * 4000;
        await new Promise((r) => setTimeout(r, delay));
        const prompt = JSON.parse(init.body).messages[0].content;
        const payload =
            prompt.includes('nutritional') || prompt.includes('nutrition')
                ? nutritionJson
                : bodyJson;
        return new Response(
            JSON.stringify({
                choices: [{ message: { content: JSON.stringify(payload) } }],
                model: 'google/gemini-2.5-flash',
            }),
            { status: 200 }
        );
    }
    return realFetch(url, init);
};

const handler = (await import(pathToFileURL(join(apiRoot, 'ai/enhance-recipe.js')).href)).default;

const recipe = {
    title: 'Slow enhance test',
    servings: 2,
    ingredients: [{ ingredient: 'flour', quantity: '1', unit: 'cup' }],
    instructions: ['Bake'],
};

async function invoke(phase, extra = {}) {
    const res = {
        statusCode: 0,
        body: null,
        setHeader() {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(b) {
            this.body = b;
        },
    };
    const started = Date.now();
    await handler(
        {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
            body: { phase, recipe, ...extra },
        },
        res
    );
    return { res, ms: Date.now() - started };
}

const bodyRun = await invoke('body');
if (bodyRun.res.statusCode !== 200 || !bodyRun.res.body?.updatedRecipe) {
    console.error('FAIL body phase', bodyRun.res.statusCode, bodyRun.res.body);
    process.exit(1);
}
if (bodyRun.ms < 18_000) {
    console.error('FAIL body phase finished too fast — mock delay not applied', bodyRun.ms);
    process.exit(1);
}
console.log('ok body phase completed in', bodyRun.ms, 'ms');

const nutritionRun = await invoke('nutrition', { bodyRecipe: bodyJson.updatedRecipe });
if (nutritionRun.res.statusCode !== 200 || !nutritionRun.res.body?.nutrition) {
    console.error('FAIL nutrition phase', nutritionRun.res.statusCode, nutritionRun.res.body);
    process.exit(1);
}
if (nutritionRun.ms < 18_000) {
    console.error('FAIL nutrition phase finished too fast', nutritionRun.ms);
    process.exit(1);
}
console.log('ok nutrition phase completed in', nutritionRun.ms, 'ms');
console.log('ok slow OpenRouter enhance phases complete under maxDuration');

globalThis.fetch = realFetch;
