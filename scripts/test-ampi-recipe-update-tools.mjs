#!/usr/bin/env node
/**
 * update_recipe tool execution with Sonnet/Gemini-style args (stubbed DB).
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

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
            'src/services/recipeEnhanceClient',
            'src/services/aiChefService',
        ],
    },
});

const { ampiTest, recipeOperations } = await import('./test-support/ampi-stubs.mjs');
const { runTools } = await import('../src/sous/tools.ts');

ampiTest.reset();
const id = await recipeOperations.create({
    title: 'Sesame Ginger Chicken Lettuce Wraps',
    ingredients: [{ ingredient: 'chicken' }],
    instructions: ['Cook'],
});

const [hashUpdate] = await runTools(
    [{ tool: 'update_recipe', args: { recipe_id: `#${id}`, title: 'Sesame Ginger Wraps' } }],
    { recentRecipeIds: [id] }
);
assert.equal(hashUpdate.type, 'recipe');
assert.equal(ampiTest.recipes.get(id).title, 'Sesame Ginger Wraps');

const [geminiUpdate] = await runTools(
    [{ tool: 'update_recipe', args: { recipeId: String(id), calories: 285, protein: 24 } }],
    { recentRecipeIds: [id] }
);
assert.equal(geminiUpdate.type, 'recipe');
assert.equal(ampiTest.recipes.get(id).calories, 285);

const [inferred] = await runTools(
    [{ tool: 'update_recipe', args: { title: 'Light Wraps' } }],
    { recentRecipeIds: [id], reply: `Updating Sesame Ginger Chicken Lettuce Wraps (#${id})...` }
);
assert.equal(inferred.type, 'recipe');
assert.equal(ampiTest.recipes.get(id).title, 'Light Wraps');

const [bad] = await runTools([{ tool: 'update_recipe', args: { recipe_id: '?' } }], {});
assert.equal(bad.type, 'error');
assert.match(bad.message, /couldn't find/i);
assert.doesNotMatch(bad.message, /#\?/);

console.log('ampi recipe update tool checks passed');
