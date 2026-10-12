#!/usr/bin/env node
import {
    coerceRecipeTemplateFromToolArgs,
    normalizeRecipe,
    templateToRecipeOperationsPayload,
} from '../api/_lib/recipeNormalize.js';

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

const messy = coerceRecipeTemplateFromToolArgs({
    title: 'Weeknight Pasta',
    description: 'A cozy bowl',
    servings: '4',
    prep_time: '10 min',
    cook_time: '20',
    ingredients: '2 cups flour\n1 egg',
    instructions: ['{"instruction":"Whisk"}', 'Bake 20 min'],
    calories: '320 kcal',
    protein: '12g',
    extra_key: 'drop me',
});

check('keeps clean title', messy.title === 'Weeknight Pasta');
check('parses newline ingredients', messy.ingredients.length === 2);
check('parses object steps', messy.steps.length >= 2);
check('coerces servings number', messy.servings === 4);
check('coerces nutrition', messy.nutrition.calories === 320);

const payload = templateToRecipeOperationsPayload(messy);
check('payload ingredients use ingredient key', payload.ingredients[0].ingredient === '2 cups flour');

const normalized = normalizeRecipe({
    id: 1,
    title: '{"title":"JSON Title","ingredients":[{"name":"salt"}],"steps":["Mix"]}',
    description: '{"steps":["x"]}',
    servings: '2',
    calories: '{"calories":100}',
    ingredients: [{ ingredient: '{"name":"butter"}', quantity: '[object Object]', unit: null }],
    instructions: ['{"instruction":"Melt butter"}'],
    tags: [],
});
check('normalize fixes json title', normalized?.title === 'JSON Title');
check('normalize fixes ingredient rows', normalized?.ingredients[0]?.ingredient === 'butter');
check('normalize fixes instruction rows', normalized?.instructions[0] === 'Melt butter');
check('normalize coerces nutrition string', normalized?.calories === 100);

const fenced = coerceRecipeTemplateFromToolArgs(
    JSON.parse(`{"title":"Pasta","ingredients":[{"ingredient":"noodles"}],"instructions":"Boil\\nDrain"}`)
);
check('string instructions become steps', fenced.steps.length === 2);

if (failures) process.exit(1);
console.log('recipe normalize checks passed');
