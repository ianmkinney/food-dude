#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    enrichRecipeDraftWithPantry,
    holdersForIngredient,
} from '../api/_lib/partyPantryMatch.js';
import { normalizePantrySnapshotItems } from '../api/_lib/partyPantryShare.js';
import { enrichPartyAmpiCardsWithPantry } from '../api/_lib/partyAmpiTurn.js';

const pantryByMember = [
    {
        memberId: 'a',
        displayName: 'Katie',
        items: normalizePantrySnapshotItems([{ name: 'cotija cheese', quantity: '1', unit: 'cup' }]),
    },
    {
        memberId: 'b',
        displayName: 'Ian',
        items: normalizePantrySnapshotItems([{ name: 'corn tortillas', quantity: '12', unit: '' }]),
    },
];

const holders = holdersForIngredient('tortillas', pantryByMember);
assert.equal(holders.length, 1);
assert.equal(holders[0].displayName, 'Ian');

const draft = enrichRecipeDraftWithPantry(
    {
        type: 'recipe_draft',
        title: 'Tacos',
        ingredients: [{ ingredient: 'tortillas' }, { ingredient: 'cotija cheese' }, { ingredient: 'lime' }],
    },
    pantryByMember
);
assert.equal(draft.missingIngredients.length, 1);
assert.equal(draft.missingIngredients[0], 'lime');
assert.equal(draft.pantryLines[0].holders[0].displayName, 'Ian');

const cards = enrichPartyAmpiCardsWithPantry([draft], pantryByMember);
assert.ok(cards[0].pantryLines);

console.log('party pantry match checks passed');
