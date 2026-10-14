#!/usr/bin/env node
/**
 * Two create_recipe actions survive tools, json_schema content, and prompt JSON.
 */
import assert from 'node:assert/strict';
import { extractAmpiTurnFromCompletion, extractAmpiTurnFromMessage, extractAmpiTurnFromText } from '../api/_lib/ampiCompletionExtract.js';
import { normalizeCanonicalAmpiTurn } from '../api/_lib/ampiActionNormalize.js';
import { buildAmpiOpenRouterBody, AMPI_STRATEGY } from '../api/_lib/ampiModelAdapter.js';
import { AMPI_OPENAI_TOOLS } from '../api/_lib/ampiActionSchema.js';
import { buildPartyAmpiDraftCards, synthesizePartyAmpiReplyText } from '../api/_lib/partyAmpiTurn.js';

const recipe = (title, ingredient) => ({
    title,
    description: `${title} for dinner`,
    servings: 4,
    prep_time: 15,
    cook_time: 25,
    calories: 480,
    protein: 32,
    carbohydrates: 40,
    fat: 18,
    fiber: 6,
    sugar: 5,
    sodium: 640,
    ingredients: [{ ingredient, quantity: '1', unit: 'lb' }],
    instructions: ['Cook until done.', 'Serve warm.'],
});

let failed = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failed += 1;
};

function assertTwo(label, extracted) {
    const turn = normalizeCanonicalAmpiTurn(extracted, { reply: extracted.reply });
    const creates = turn.actions.filter((action) => action.tool === 'create_recipe');
    check(`${label}: two actions`, creates.length === 2 && turn.actions.length === 2);
    check(`${label}: titles`, creates[0]?.args?.title === 'Turkey Tacos' && creates[1]?.args?.title === 'Bean Chili');
    check(`${label}: valid template`, turn.valid === true);
}

assertTwo(
    'tool_calls',
    extractAmpiTurnFromMessage({
        content: 'Two dinners.',
        tool_calls: [
            { id: 'a', type: 'function', function: { name: 'create_recipe', arguments: JSON.stringify(recipe('Turkey Tacos', 'turkey')) } },
            { id: 'b', type: 'function', function: { name: 'create_recipe', arguments: JSON.stringify(recipe('Bean Chili', 'beans')) } },
        ],
    })
);

assertTwo(
    'anthropic tool_use',
    extractAmpiTurnFromMessage({
        content: [
            { type: 'text', text: 'Two dinners.' },
            { type: 'tool_use', name: 'create_recipe', input: recipe('Turkey Tacos', 'turkey') },
            { type: 'tool_use', name: 'create_recipe', input: recipe('Bean Chili', 'beans') },
        ],
    })
);

const jsonBody = JSON.stringify({
    reply: 'Two dinners.',
    actions: [
        { tool: 'create_recipe', args: recipe('Turkey Tacos', 'turkey') },
        { tool: 'create_recipe', args: recipe('Bean Chili', 'beans') },
    ],
});

assertTwo(
    'json_schema content',
    extractAmpiTurnFromCompletion({ choices: [{ message: { content: jsonBody } }] })
);

assertTwo(
    'prompt JSON fences',
    extractAmpiTurnFromText('```json\n' + jsonBody + '\n```')
);

const native = buildAmpiOpenRouterBody({
    model: 'openai/gpt-test',
    messages: [{ role: 'user', content: 'make me 2 dinner recipes' }],
    maxTokens: 800,
    strategy: AMPI_STRATEGY.NATIVE_TOOLS,
});
check('native tools allow parallel create_recipe', native.parallel_tool_calls === true && native.tools === AMPI_OPENAI_TOOLS);
const createTool = native.tools.find((tool) => tool.function?.name === 'create_recipe');
check('create_recipe tool says one call per dish', /once per dish/.test(createTool.function.description));

const schemaBody = buildAmpiOpenRouterBody({
    model: 'google/gemini-test',
    messages: [{ role: 'user', content: 'give us 2 meals' }],
    maxTokens: 800,
    strategy: AMPI_STRATEGY.JSON_SCHEMA,
});
check(
    'json schema describes multiple create_recipe',
    /N separate create_recipe/.test(schemaBody.response_format.json_schema.schema.properties.actions.description)
);

const promptBody = buildAmpiOpenRouterBody({
    model: 'meta/llama-test',
    messages: [{ role: 'system', content: 'You are Ampi.' }, { role: 'user', content: '2 different ones' }],
    maxTokens: 800,
    strategy: AMPI_STRATEGY.PROMPT_JSON,
});
check('prompt JSON tells the model to emit N create_recipe actions', /N create_recipe actions/.test(promptBody.messages[0].content));

const cards = buildPartyAmpiDraftCards([
    { tool: 'create_recipe', args: recipe('Turkey Tacos', 'turkey') },
    { tool: 'create_recipe', args: recipe('Bean Chili', 'beans') },
]);
check('party draft cards: two', cards.length === 2 && cards[0].title === 'Turkey Tacos' && cards[1].title === 'Bean Chili');
check(
    'party empty reply names both',
    /Turkey Tacos/.test(synthesizePartyAmpiReplyText('', cards.map((card) => card.pendingAction))) &&
        /Bean Chili/.test(synthesizePartyAmpiReplyText('', cards.map((card) => card.pendingAction)))
);

if (failed) {
    console.error(`${failed} multi-recipe check(s) failed`);
    process.exit(1);
}
console.log('multi-recipe action checks passed');
