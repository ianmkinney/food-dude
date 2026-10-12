#!/usr/bin/env node
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./test-support/ts-hooks.mjs', import.meta.url, {
    data: { stubUrl: new URL('./test-support/ampi-stubs.mjs', import.meta.url).href, stubbed: [] },
});

const { recipeCardNeedsAutoImage, withAutoImageLoading } = await import(
    '../src/sous/autoRecipeImagePolicy.ts'
);
const { buildRecipeImagePrompt } = await import('../src/services/recipeImagePrompt.js');

let passed = 0;
const test = (name, fn) => {
    fn();
    passed += 1;
    console.log('ok', name);
};

test('needs auto image when recipe has no cover and no user file', () => {
    assert.ok(
        recipeCardNeedsAutoImage({
            type: 'recipe',
            title: 'Saved',
            recipe: { id: 1, title: 'Soup' },
            aiGenerated: true,
        })
    );
    assert.ok(
        !recipeCardNeedsAutoImage({
            type: 'recipe',
            title: 'Saved',
            recipe: { id: 1, title: 'Soup', image_uri: 'file:///x.jpg' },
            aiGenerated: true,
            fromUserFile: true,
        })
    );
    assert.ok(
        !recipeCardNeedsAutoImage({
            type: 'recipe',
            title: 'Saved',
            recipe: { id: 1, title: 'Soup', image_uri: 'https://x/y.jpg' },
            aiGenerated: true,
        })
    );
});

test('withAutoImageLoading marks eligible cards', () => {
    const out = withAutoImageLoading([
        { type: 'recipe', title: 't', recipe: { id: 2, title: 'Pasta' }, aiGenerated: true },
        { type: 'grocery', items: ['milk'] },
    ]);
    assert.equal(out[0].autoImage?.status, 'loading');
    assert.equal(out[1].type, 'grocery');
});

test('buildRecipeImagePrompt includes title', () => {
    const p = buildRecipeImagePrompt({ title: 'Lasagna Soup', ingredients: [{ ingredient: 'noodles' }] });
    assert.match(p, /Lasagna Soup/);
    assert.match(p, /noodles/);
});

console.log(`All ${passed} auto recipe image tests passed.`);
