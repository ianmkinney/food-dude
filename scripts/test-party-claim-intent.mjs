#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    parsePartyClaimUtterance,
    parsePartyMissingCommand,
    planPartyChatCommand,
} from '../api/_lib/partyClaimIntent.js';

const self = parsePartyClaimUtterance("I'll bring the tortillas");
assert.equal(self?.kind, 'self');
assert.equal(self?.ingredientName, 'tortillas');

const katie = parsePartyClaimUtterance('@Ampi Katie is bringing cheese');
assert.equal(katie?.kind, 'member');
assert.equal(katie?.claimedByMemberName, 'Katie');
assert.equal(katie?.ingredientName, 'cheese');

assert.equal(parsePartyClaimUtterance('@Ampi suggest a mexican dinner'), null);

const grocery = parsePartyMissingCommand('@Ampi add the missing ingredients to my grocery list');
assert.equal(grocery?.kind, 'grocery');
const claims = parsePartyMissingCommand('add missing ingredients as party meal items to claim');
assert.equal(claims?.kind, 'claims');

const meals = [{ sync_meal_id: 'meal-1', name: 'Saturday Dinner' }];
const planned = planPartyChatCommand("I'll bring the tortillas", {
    meals,
    myDisplayName: 'Alex Cook',
});
assert.match(planned.body, /Alex Cook will bring the tortillas/);
assert.equal(planned.actions[0].tool, 'claim_party_ingredient');
assert.equal(planned.actions[0].args.ingredientName, 'tortillas');
assert.equal(planned.actions[0].args.mealId, 'meal-1');

const named = planPartyChatCommand('@Ampi Katie is bringing cheese', {
    meals,
    myDisplayName: 'Alex Cook',
});
assert.match(named.body, /Katie is bringing the cheese/);
assert.equal(named.actions[0].args.claimedByMemberName, 'Katie');

const card = {
    type: 'recipe_draft',
    title: 'Tacos',
    missingIngredients: ['tortillas', 'lime'],
};
const missingPlan = planPartyChatCommand('@Ampi add the missing ingredients to my grocery list', {
    messages: [{ attachment: { ampi: { cards: [card] } } }],
    meals,
    myDisplayName: 'Alex Cook',
});
assert.match(missingPlan.body, /grocery list/);
assert.equal(missingPlan.actions[0].tool, 'add_to_grocery');
assert.deepEqual(
    missingPlan.actions[0].args.items.map((item) => item.name),
    ['tortillas', 'lime']
);

console.log('party claim intent checks passed');
