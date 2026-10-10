#!/usr/bin/env node
/**
 * Exercise recipe URL fetch + extraction (network) and the import handler auth path.
 * Run: node scripts/test-recipe-import.mjs
 */
import assert from 'node:assert/strict';

const TEST_URLS = [
    'https://ohsweetbasil.com/the-easiest-korean-ground-beef-recipe/',
    'https://www.kingarthurbaking.com/recipes/classic-birthday-cake-recipe',
    'https://www.tasteofhome.com/recipes/slow-cooker-chili/',
];

const { safeFetchHtml } = await import('../api/_lib/ssrf.js');
const { extractRecipeFromHtml, hasRecipeShape } = await import('../api/_lib/recipeExtract.js');

for (const url of TEST_URLS) {
    console.log('fetch', url);
    const { html, finalUrl } = await safeFetchHtml(url);
    assert.ok(html.length > 500, 'html too short');
    const { structured, text } = extractRecipeFromHtml(html);
    const ok = hasRecipeShape(structured) || (text && text.length > 200);
    assert.ok(ok, `no recipe signal for ${finalUrl}`);
    if (hasRecipeShape(structured)) {
        console.log('  structured:', structured.title, `(${structured.ingredients.length} ing, ${structured.steps.length} steps)`);
    } else {
        console.log('  text fallback:', text.slice(0, 80).replace(/\s+/g, ' '), '…');
    }
}

process.env.SESSION_SECRET = 'local-test-secret';
process.env.ALLOWED_EMAILS = 'owner@example.com';
const { signSession } = await import('../api/_lib/session.js');
const { default: importHandler } = await import('../api/recipes/import.js');

const owner = await signSession({ sub: 'g-1', email: 'owner@example.com', name: 'Owner' });

function callImport(token, body) {
    const req = {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body,
    };
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            headers: {},
            setHeader() {},
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                resolve({ status: this.statusCode, body: payload });
            },
        };
        importHandler(req, res);
    });
}

const sample = await callImport(owner, { url: TEST_URLS[0] });
assert.equal(sample.status, 200);
assert.ok(sample.body.title);
assert.ok(sample.body.ingredients?.length || sample.body.text);

const noAuth = await callImport(null, { url: TEST_URLS[0] });
assert.equal(noAuth.status, 401);

console.log('recipe import checks passed');
