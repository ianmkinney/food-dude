#!/usr/bin/env node
import assert from 'node:assert/strict';
import { inferRecipeTitle, isPlaceholderRecipeTitle, resolveRecipeTitleForSave } from '../api/_lib/recipeTitle.js';

assert.equal(isPlaceholderRecipeTitle('Untitled recipe'), true);
assert.equal(inferRecipeTitle({ description: 'Creamy Tuscan chicken with spinach' }), 'Creamy Tuscan chicken with spinach');
assert.equal(
    resolveRecipeTitleForSave({
        title: 'Untitled recipe',
        ingredients: [{ ingredient: 'chicken breast', quantity: '2', unit: 'lb' }],
    }),
    'chicken breast',
);
console.log('recipe title checks passed');
