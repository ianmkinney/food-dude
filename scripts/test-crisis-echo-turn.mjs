#!/usr/bin/env node
/**
 * A model that copies the canned crisis script on a cooking turn must not
 * replace the reply. Explicit crisis never calls the model.
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

const { ampiTest } = await import('./test-support/ampi-stubs.mjs');
const { askSous } = await import('../src/sous/agent.ts');
const { CRISIS_REPLY } = await import('../src/safety/crisisIntent.js');
const { sanitizePartyAmpiModelRaw } = await import('../src/safety/partyAmpiSafety.js');
const { formatPartyAmpiReplyBody } = await import('../api/_lib/partyAmpiReply.js');

const recipe = (title, ingredient) => ({
    tool: 'create_recipe',
    args: {
        title,
        servings: 4,
        ingredients: [{ ingredient, quantity: '1', unit: 'lb' }],
        instructions: ['Cook until done.'],
    },
});

let failed = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failed += 1;
};

ampiTest.reset();
let calls = 0;
ampiTest.model = (prompt) => {
    calls += 1;
    if (calls === 1) return CRISIS_REPLY;
    assert.doesNotMatch(prompt, /988/);
    assert.match(prompt, /canned refusal/);
    return JSON.stringify({
        reply: 'Two different dinners, coming up.',
        actions: [recipe('Turkey Tacos', 'turkey'), recipe('Bean Chili', 'beans')],
    });
};
const cooking = await askSous([], 'Looks good, 2 different ones now');
check('screenshot phrase is not the canned reply', !cooking.reply.includes('988') && !cooking.reply.includes("can't help with this"));
check('screenshot phrase retried once', calls === 2);
check('screenshot phrase saved two recipe cards', cooking.cards.filter((card) => card.type === 'recipe').length === 2);
check('prompt never included the hotline script', ampiTest.prompts.every((prompt) => !prompt.includes('988')));

ampiTest.reset();
ampiTest.model = () => {
    throw new Error('model should not be called for explicit crisis');
};
const crisis = await askSous([], 'I want to kill myself');
check('explicit crisis returns the canned reply', crisis.reply === CRISIS_REPLY);
check('explicit crisis has no cards', crisis.cards.length === 0);

ampiTest.reset();
calls = 0;
ampiTest.model = () => {
    calls += 1;
    if (calls === 1) {
        return JSON.stringify({
            reply: 'One so far.',
            actions: [recipe('Sheet Pan Fajitas', 'chicken')],
        });
    }
    return JSON.stringify({
        reply: 'Both dinners.',
        actions: [recipe('Sheet Pan Fajitas', 'chicken'), recipe('Veggie Fried Rice', 'rice')],
    });
};
const counted = await askSous([], 'make me 2 dinner recipes');
check('short recipe count is retried', calls === 2);
check('counted command returns two cards', counted.cards.filter((card) => card.type === 'recipe').length === 2);
check('counted reply is cooking', !counted.reply.includes('988'));

const partyRaw = sanitizePartyAmpiModelRaw(
    JSON.stringify({
        reply: CRISIS_REPLY,
        actions: [recipe('Turkey Tacos', 'turkey'), recipe('Bean Chili', 'beans')],
    }),
    'Looks good, 2 different ones now'
);
const party = formatPartyAmpiReplyBody(partyRaw);
check('party echo is not the canned reply', !party.text.includes('988'));
check('party echo still has two draft cards', party.cards.length === 2);

const partyCrisis = formatPartyAmpiReplyBody(
    sanitizePartyAmpiModelRaw(
        JSON.stringify({ reply: 'Here is a cake.', actions: [recipe('Cake', 'flour')] }),
        "I'm having a severe allergic reaction"
    )
);
check('party explicit crisis keeps the canned reply', partyCrisis.text === CRISIS_REPLY);
check('party explicit crisis drops recipe cards', partyCrisis.cards.length === 0);

if (failed) {
    console.error(`${failed} crisis echo turn check(s) failed`);
    process.exit(1);
}
console.log('crisis echo turn checks passed');
