#!/usr/bin/env node
/**
 * Vision chat: OpenRouter message parts + Ampi auto-save from image attachment.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenRouterMessages, bodyHasImages } from '../api/_lib/chatOpenRouterMessages.js';

register('./test-support/ts-hooks.mjs', import.meta.url, {
    data: {
        stubUrl: new URL('./test-support/ampi-stubs.mjs', import.meta.url).href,
        stubbed: [
            'react-native',
            '@react-native-async-storage/async-storage',
            'src/database/operations',
            'src/services/aiClient',
            'src/sous/chatAttachments',
            'src/consent/consentStore',
            'src/services/recipeParser',
            'src/services/groceryService',
            'src/services/mediaPrep',
        ],
    },
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(repoRoot, 'scripts/fixtures/recipe-card-sample.png');
let fixtureB64;
try {
    fixtureB64 = readFileSync(fixturePath).toString('base64');
} catch {
    fixtureB64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

const imagePart = { mimeType: 'image/png', data: fixtureB64 };

const messages = buildOpenRouterMessages({
    system: 'You are Ampi.',
    turns: [
        {
            role: 'user',
            text: 'Can you add this as a new recipe?',
            images: [imagePart],
        },
    ],
});
assert.equal(messages.length, 2);
const user = messages[1];
assert.ok(Array.isArray(user.content), 'user content should be multimodal parts');
const hasImage = user.content.some(
    (p) => p.type === 'image_url' && p.image_url?.url?.startsWith('data:image/png;base64,')
);
assert.ok(hasImage, 'payload must include image_url part');
assert.ok(bodyHasImages({ turns: [{ role: 'user', text: 'x', images: [imagePart] }] }));
console.log('ok openrouter multimodal parts');

const { ampiTest } = await import('./test-support/ampi-stubs.mjs');
const { askSous } = await import('../src/sous/agent.ts');

ampiTest.reset();
ampiTest.preparedAttachments = {
    promptExtra: '',
    images: [imagePart],
    attachments: [{ name: 'IMG.png', kind: 'image', sourceLabel: 'user upload', textSnippet: '', recipeImageUri: null }],
};
ampiTest.model = () =>
    JSON.stringify({
        reply: 'Saved — tap the card to review.',
        actions: [
            {
                tool: 'create_recipe',
                args: {
                    title: 'Creamy Bulgogi',
                    ingredients: [{ ingredient: 'beef' }],
                    instructions: ['Cook.'],
                },
            },
        ],
    });

const result = await askSous([], 'Can you add this as a new recipe?', [
    { id: '1', name: 'IMG.png', kind: 'image', uri: 'blob:test' },
]);

assert.ok(ampiTest.lastMultimodal?.turns?.some((t) => t.images?.length), 'askSous should pass images on turns');
assert.ok(ampiTest.recipes.size >= 1, 'create_recipe should run without confirm');
assert.equal([...ampiTest.recipes.values()][0].title, 'Creamy Bulgogi');
assert.ok(result.cards.some((c) => c.type === 'recipe'), 'recipe card should be returned');
console.log('ok ampi image auto-save');
console.log('ampi vision checks passed');
