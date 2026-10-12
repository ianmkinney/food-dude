#!/usr/bin/env node
import assert from 'node:assert/strict';
import { parseRecipeJsonFromModelText } from '../api/_lib/parseRecipeJson.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

const good = parseRecipeJsonFromModelText(
    '{"title":"Garlic Noodles","ingredients":[{"ingredient":"noodles","quantity":"8","unit":"oz"}],"instructions":["Boil noodles"]}',
);
check('parses object recipe', good.title === 'Garlic Noodles');

let threw = false;
try {
    parseRecipeJsonFromModelText("I'll extract that recipe for you in a moment.");
} catch (error) {
    threw = true;
    check('prose does not JSON.parse as recipe', !String(error.message).includes('Unexpected identifier'));
}
check('prose throws friendly error', threw);

if (failures) process.exit(1);
console.log('parse recipe json checks passed');
