#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    synthesizePartyAmpiReplyText,
    buildPartyAmpiDraftCards,
    partyAmpiShouldAutoAddToMeals,
    partyAmpiAttachmentFromTurn,
    attachmentHasPartyPayload,
} from '../api/_lib/partyAmpiTurn.js';

assert.match(
    synthesizePartyAmpiReplyText('', [{ tool: 'create_recipe', args: { title: 'Tacos' } }]),
    /Tacos/i
);
const cards = buildPartyAmpiDraftCards([
    {
        tool: 'create_recipe',
        args: {
            title: 'Enchiladas',
            ingredients: [{ ingredient: 'tortillas', quantity: '8', unit: '' }],
            instructions: ['Roll and bake'],
        },
    },
]);
assert.equal(cards[0].title, 'Enchiladas');
assert.ok(partyAmpiShouldAutoAddToMeals('add to party meals tonight'));
assert.ok(attachmentHasPartyPayload(partyAmpiAttachmentFromTurn({ cards, pendingActions: [] })));
console.log('party ampi turn checks passed');
