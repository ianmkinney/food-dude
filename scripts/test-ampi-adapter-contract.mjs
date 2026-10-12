#!/usr/bin/env node
/**
 * Contract tests: provider-style completions → extract → normalize → canonical actions.
 */
import assert from 'node:assert/strict';
import { extractAmpiTurnFromCompletion, extractAmpiTurnFromMessage } from '../api/_lib/ampiCompletionExtract.js';
import { normalizeCanonicalAmpiTurn } from '../api/_lib/ampiActionNormalize.js';
import { pickAmpiStrategy, AMPI_STRATEGY } from '../api/_lib/ampiModelAdapter.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

const context = { reply: 'Updated recipe (#10) with extra garlic.', recentRecipeIds: [10, 3] };

function normFromMessage(message) {
    const extracted = extractAmpiTurnFromMessage(message);
    return normalizeCanonicalAmpiTurn(extracted, { ...context, reply: extracted.reply || context.reply });
}

// Claude-style tool_use blocks via OpenRouter
const claude = normFromMessage({
    content: [
        { type: 'text', text: 'I updated the recipe for you.' },
        {
            type: 'tool_use',
            name: 'update_recipe',
            input: { recipe_id: '#10', title: 'Garlic Lasagna Soup' },
        },
    ],
});
check('claude: coerces recipe_id', claude.actions[0]?.args?.recipe_id === 10);
check('claude: valid', claude.valid);

// OpenAI / GPT tool_calls
const gpt = normFromMessage({
    content: '',
    tool_calls: [
        {
            id: 'call_1',
            type: 'function',
            function: {
                name: 'update_recipe',
                arguments: JSON.stringify({ recipeId: '10', calories: 320 }),
            },
        },
    ],
});
check('gpt tool_calls: recipe_id', gpt.actions[0]?.args?.recipe_id === 10);
check('gpt tool_calls: valid', gpt.valid);

// Gemini / json_schema content
const geminiCompletion = {
    choices: [
        {
            message: {
                content: JSON.stringify({
                    reply: 'Done.',
                    actions: [{ tool: 'update_recipe', args: { recipe_id: 10, title: 'Spicy Soup' } }],
                }),
            },
        },
    ],
};
const gemini = normalizeCanonicalAmpiTurn(extractAmpiTurnFromCompletion(geminiCompletion), context);
check('gemini json: valid', gemini.valid);

// Llama prompt JSON in fences
const llamaText = '```json\n' + JSON.stringify({
    reply: 'Saved.',
    actions: [{ tool: 'add_to_grocery', args: { items: [{ name: 'garlic' }] } }],
}) + '\n```';
const llamaExtract = extractAmpiTurnFromCompletion({
    choices: [{ message: { content: llamaText } }],
});
const llamaNorm = normalizeCanonicalAmpiTurn(llamaExtract, context);
check('llama fenced: parsed grocery', llamaNorm.actions[0]?.tool === 'add_to_grocery');

// Mistral missing id + reply hint
const mistral = normalizeCanonicalAmpiTurn(
    extractAmpiTurnFromCompletion({
        choices: [
            {
                message: {
                    content: JSON.stringify({
                        reply: 'Tweaked your lasagna (#10).',
                        actions: [{ tool: 'update_recipe', args: { title: 'Tweaked Lasagna' } }],
                    }),
                },
            },
        ],
    }),
    context,
);
check('mistral: inferred id from reply', mistral.actions[0]?.args?.recipe_id === 10);

// DeepSeek double-encoded string
const inner = JSON.stringify({
    reply: 'Planner updated.',
    actions: [
        {
            tool: 'add_to_meal_plan',
            args: { recipe_id: 10, date: '2026-10-12', meal_type: 'dinner' },
        },
    ],
});
const deepseek = normalizeCanonicalAmpiTurn(
    extractAmpiTurnFromCompletion({
        choices: [{ message: { content: JSON.stringify(inner) } }],
    }),
    context,
);
check('deepseek double-encoded: meal plan valid', deepseek.valid);

// Strategy selection from catalog metadata
check(
    'strategy tools-first',
    pickAmpiStrategy({ supportedParameters: ['tools', 'response_format'] }) === AMPI_STRATEGY.NATIVE_TOOLS,
);
check(
    'strategy json_schema',
    pickAmpiStrategy({ supportedParameters: ['response_format'] }) === AMPI_STRATEGY.JSON_SCHEMA,
);
check(
    'strategy prompt_json',
    pickAmpiStrategy({ supportedParameters: [] }) === AMPI_STRATEGY.PROMPT_JSON,
);

// Invalid update_recipe triggers validation error
const bad = normalizeCanonicalAmpiTurn(
    {
        reply: 'oops',
        actions: [{ tool: 'update_recipe', args: { calories: 100 } }],
    },
    { reply: 'oops', recentRecipeIds: [] },
);
check('invalid update without id/title fails validation', !bad.valid);

if (failures) {
    console.error(`${failures} contract check(s) failed`);
    process.exit(1);
}
console.log('ampi adapter contract checks passed');
