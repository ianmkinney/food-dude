#!/usr/bin/env node
/**
 * Crisis detection must be explicit. Cooking chat, counts, and kitchen idioms
 * never take the canned 988/911 reply.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    CRISIS_REPLY,
    COOKING_FALLBACK_REPLY,
    isCrisisMessage,
    looksLikeCannedCrisisReply,
    replacementForCrisisEcho,
    unwantedCrisisEcho,
} from '../src/safety/crisisIntent.js';
import { requestedNewRecipeCount } from '../api/_lib/recipeRequestCount.js';
import { AMPI_JSON_TURN_INSTRUCTION, AMPI_NO_CRISIS_SCRIPT_RULE } from '../api/_lib/ampiActionSchema.js';

const FALSE_POSITIVES = [
    'Looks good, 2 different ones now',
    'looks good',
    'thanks',
    'ok',
    'two',
    '2',
    'two different ones',
    'make me 2 dinner recipes',
    'give us 2 meals',
    'make me 3 dinner recipes',
    'kill the heat',
    'kill the heat and rest the steak',
    'dying to try this',
    "I'm dying to try your fajitas",
    'use a knife',
    'cut the onion',
    'cut the onions thin',
    "don't abuse the salt",
    'how do I avoid an allergic reaction',
    'allergic reaction',
    'abuse',
    'this spice will kill me',
    'to die for',
    'suicide wings',
    'I cut myself a slice of bread',
    'I cut myself chopping onions',
    'knife skills',
    'recipe for 4 people',
    'the chicken needs 2 more minutes',
];

const TRUE_POSITIVES = [
    'I want to die',
    'I want to kill myself',
    "I'm suicidal",
    'suicide',
    "I'm thinking about suicide",
    'I am going to end my life',
    'I want to end it all',
    'end it all',
    "I'm going to hurt myself",
    "I'm cutting myself",
    'I want to hurt myself',
    'self-harm',
    'I overdosed',
    'I overdosed on pills',
    "I can't breathe",
    'I cannot breathe',
    "I'm having an allergic reaction",
    "I'm having a severe allergic reaction",
    'my throat is closing',
    'my throat is swelling',
    'I need my epipen',
    'anaphylaxis',
    "I'm being abused",
    'he is abusing me',
    'this is a medical emergency',
    'I need an ambulance',
    "I don't want to live anymore",
];

let failed = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failed += 1;
};

for (const text of FALSE_POSITIVES) {
    check(`not crisis: ${text}`, isCrisisMessage(text) === false);
}
for (const text of TRUE_POSITIVES) {
    check(`crisis: ${text}`, isCrisisMessage(text) === true);
}

check('canned reply is recognized', looksLikeCannedCrisisReply(CRISIS_REPLY));
check('cooking reply is not canned', looksLikeCannedCrisisReply('Here are two fajita recipes.') === false);
check(
    'screenshot phrase is an unwanted echo',
    unwantedCrisisEcho('Looks good, 2 different ones now', CRISIS_REPLY)
);
check('explicit crisis is not an unwanted echo', unwantedCrisisEcho('I want to die', CRISIS_REPLY) === false);
check(
    'echo replacement is not the canned script',
    !looksLikeCannedCrisisReply(replacementForCrisisEcho([])) &&
        replacementForCrisisEcho([]) === COOKING_FALLBACK_REPLY
);
check(
    'echo keeps recipe titles',
    replacementForCrisisEcho([
        { tool: 'create_recipe', args: { title: 'Turkey Tacos' } },
        { tool: 'create_recipe', args: { title: 'Bean Chili' } },
    ]).includes('Turkey Tacos') &&
        replacementForCrisisEcho([
            { tool: 'create_recipe', args: { title: 'Turkey Tacos' } },
            { tool: 'create_recipe', args: { title: 'Bean Chili' } },
        ]).includes('Bean Chili')
);

check('screenshot asks for 2 recipes', requestedNewRecipeCount('Looks good, 2 different ones now') === 2);
check('3 dinner recipes', requestedNewRecipeCount('make me 3 dinner recipes') === 3);
check('2 meals', requestedNewRecipeCount('give us 2 meals') === 2);
check('two different ones', requestedNewRecipeCount('two different ones') === 2);
check('a couple of meals', requestedNewRecipeCount('give us a couple of meals') === 2);
check('single pasta request is not a count', requestedNewRecipeCount('Give me a new chicken pasta recipe') === null);
check('servings are not a recipe count', requestedNewRecipeCount('recipe for 4 people') === null);
check('kill the heat is not a recipe count', requestedNewRecipeCount('kill the heat') === null);

const promptFiles = [
    'src/sous/agent.ts',
    'src/services/partyAmpiChat.js',
    'api/_lib/ampiActionSchema.js',
    'src/sous/tools.ts',
    'api/_lib/ampiResponseSchema.js',
    'api/_lib/ampiModelAdapter.js',
];
for (const file of promptFiles) {
    const text = fs.readFileSync(file, 'utf8');
    check(`${file} does not quote 988`, !text.includes('988'));
    check(`${file} does not quote the crisis script`, !text.includes('Suicide & Crisis'));
}
check('main prompt uses the no-script rule', fs.readFileSync('src/sous/agent.ts', 'utf8').includes('AMPI_NO_CRISIS_SCRIPT_RULE'));
check('party prompt uses the multi-recipe rule', fs.readFileSync('src/services/partyAmpiChat.js', 'utf8').includes('AMPI_MULTI_RECIPE_RULE'));
check('json instruction names multiple create_recipe', /N create_recipe actions/.test(AMPI_JSON_TURN_INSTRUCTION));
check('no-script rule has no hotline number', !AMPI_NO_CRISIS_SCRIPT_RULE.includes('988') && !AMPI_NO_CRISIS_SCRIPT_RULE.includes('911'));
check('chat renders every card', fs.readFileSync('src/sous/SousScreen.tsx', 'utf8').includes('item.cards?.map'));

if (failed) {
    console.error(`${failed} crisis intent check(s) failed`);
    process.exit(1);
}
console.log('crisis intent checks passed');
