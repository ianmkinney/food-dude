#!/usr/bin/env node
/**
 * TikTok import fixture tests.
 * Run: node scripts/test-tiktok-import.mjs
 */
import assert from 'node:assert/strict';

const { isTikTokPostUrl } = await import('../api/_lib/tiktokImport.js');
const { looksLikeFullRecipe } = await import('../api/_lib/instagramImport.js');

const { resolveTikTokUrl } = await import('../api/_lib/tiktokImport.js');

assert.ok(isTikTokPostUrl('https://www.tiktok.com/@chef/video/7123456789012345678'));
assert.ok(isTikTokPostUrl('https://www.tiktok.com/@chef/photo/7123456789012345678'));
assert.ok(isTikTokPostUrl('https://www.tiktok.com/t/ZPLhNRp2k/'));
assert.ok(isTikTokPostUrl('https://www.tiktok.com/t/ZPLBA5bdT/'));
assert.ok(isTikTokPostUrl('https://vm.tiktok.com/ZMabcdef/'));
assert.ok(isTikTokPostUrl('https://vt.tiktok.com/ZMabcdef/'));
assert.ok(!isTikTokPostUrl('https://example.com/video/1'));

const resolved = await resolveTikTokUrl('https://www.tiktok.com/t/ZPLhNRp2k/');
assert.match(resolved, /\/@[^/]+\/video\/\d+/);

const desc =
    'Garlic noodles\n\nIngredients:\n- 8 oz noodles\n- 4 cloves garlic\n\nSteps:\n1. Boil noodles\n2. Sauté garlic';
assert.ok(looksLikeFullRecipe(desc));

console.log('tiktok import fixture checks passed');
