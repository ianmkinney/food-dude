#!/usr/bin/env node
/**
 * Tool-arg normalization for update_recipe across Sonnet/Gemini-style JSON.
 */
import {
    normalizeToolCalls,
    parseRecipeId,
    parseRecipeIdFromReply,
} from '../api/_lib/ampiToolNormalize.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

check('parse #10', parseRecipeId('#10') === 10);
check('parse string 10', parseRecipeId('10') === 10);
check('parse recipe_id number', parseRecipeId(10) === 10);
check('reject ?', parseRecipeId('?') === null);
check('reply paren id', parseRecipeIdFromReply('Updating Sesame Ginger Chicken (#10)...') === 10);

const sonnet = normalizeToolCalls(
    [{ tool: 'update_recipe', args: { recipe_id: '10', title: 'New Name' } }],
    { reply: 'Updating Sesame Ginger Chicken Lettuce Wraps (#10)...' }
);
check('sonnet string id', sonnet[0]?.args?.recipe_id === 10);

const gemini = normalizeToolCalls(
    [{ tool: 'update_recipe', args: { recipeId: '#10', calories: 320 } }],
    {}
);
check('gemini recipeId alias', gemini[0]?.args?.recipe_id === 10);
check('gemini keeps calories', gemini[0]?.args?.calories === 320);

const missingId = normalizeToolCalls(
    [{ tool: 'update_recipe', args: { title: 'Tweak spices' } }],
    { reply: 'Updating wraps (#10)...', recentRecipeIds: [99] }
);
check('fills id from reply', missingId[0]?.args?.recipe_id === 10);

const contextOnly = normalizeToolCalls(
    [{ tool: 'update_recipe', args: { title: 'Rename' } }],
    { recentRecipeIds: [42] }
);
check('falls back to recent chat recipe', contextOnly[0]?.args?.recipe_id === 42);

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('ampi recipe update parse checks passed');
