#!/usr/bin/env node
/**
 * Contract e2e: "@Ampi suggest a mexican dinner" → non-empty reply + recipe draft card.
 * (Full Playwright UI test: npm run build:web && node scripts/test-party-ampi-mexican-playwright.mjs)
 */
import assert from 'node:assert/strict';
import { formatPartyAmpiReplyBody } from '../api/_lib/partyAmpiReply.js';

const modelPayload = JSON.stringify({
    reply: '',
    actions: [
        {
            tool: 'create_recipe',
            args: {
                title: 'Mexican Street Corn Bowls',
                servings: 4,
                ingredients: [
                    { ingredient: 'corn', quantity: '3', unit: 'cups' },
                    { ingredient: 'cotija cheese', quantity: '1/2', unit: 'cup' },
                ],
                instructions: ['Char the corn', 'Toss with crema and lime', 'Top with cheese'],
            },
        },
    ],
});

const parsed = formatPartyAmpiReplyBody(modelPayload);
assert.ok(parsed.text.length > 0, 'reply text must not be empty');
assert.match(parsed.text, /Mexican|Street Corn/i);
assert.equal(parsed.cards.length, 1);
assert.equal(parsed.cards[0].title, 'Mexican Street Corn Bowls');
assert.equal(parsed.cards[0].type, 'recipe_draft');

console.log('party ampi mexican e2e contract passed');
