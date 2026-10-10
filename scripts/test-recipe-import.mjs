#!/usr/bin/env node
import assert from 'node:assert/strict';
import { extractRecipeFromHtml, parseDurationMinutes } from '../api/lib/recipeExtract.js';
import { isBlockedIp } from '../api/lib/ssrf.js';

assert.equal(parseDurationMinutes('PT1H30M'), 90);
assert.equal(isBlockedIp('127.0.0.1'), true);
assert.equal(isBlockedIp('8.8.8.8'), false);

const sampleLd = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {"@type": "WebPage", "name": "Page"},
    {
      "@type": "Recipe",
      "name": "Test Korean Beef",
      "recipeIngredient": ["1 lb beef", "2 tbsp soy sauce"],
      "recipeInstructions": [
        {"@type": "HowToSection", "name": "Cook", "itemListElement": [
          {"@type": "HowToStep", "text": "Brown the beef."},
          {"@type": "HowToStep", "text": "Stir in sauce."}
        ]}
      ],
      "prepTime": "PT10M",
      "cookTime": "PT15M",
      "recipeYield": "4 servings"
    }
  ]
}
</script></head><body></body></html>`;

const parsed = extractRecipeFromHtml(sampleLd, 'https://example.com/recipe');
assert.equal(parsed.mode, 'structured');
assert.equal(parsed.recipe.title, 'Test Korean Beef');
assert.equal(parsed.recipe.steps.length, 2);
assert.equal(parsed.recipe.times.prepMinutes, 10);

process.env.SESSION_SECRET = 'local-test-secret';
process.env.ALLOWED_EMAILS = 'owner@example.com';

const { signSession } = await import('../api/lib/session.js');
const { default: importHandler } = await import('../api/recipes/import.js');

const realFetch = globalThis.fetch;
const liveUrls = process.argv.includes('--live')
    ? [
          'https://ohsweetbasil.com/the-easiest-korean-ground-beef-recipe/',
          'https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies',
          'https://minimalistbaker.com/easy-vegan-fried-rice/',
      ]
    : [];

if (liveUrls.length) {
    console.log('Live import checks:', liveUrls.length);
    for (const url of liveUrls) {
        const req = {
            method: 'POST',
            headers: { authorization: `Bearer ${await signSession({ sub: 'g-1', email: 'owner@example.com', name: 'Owner' })}` },
            body: { url },
        };
        const result = await new Promise((resolve) => {
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
        assert.ok(result.status === 200, `${url} -> ${result.status} ${JSON.stringify(result.body)}`);
        assert.ok(result.body.mode === 'structured' || result.body.mode === 'text', url);
        console.log('ok', url, result.body.mode, result.body.recipe?.title || result.body.titleHint || 'text');
    }
} else {
    globalThis.fetch = async (url) => {
        assert.match(String(url), /example\.org/);
        return new Response(sampleLd, { status: 200, headers: { 'Content-Type': 'text/html' } });
    };

    const token = await signSession({ sub: 'g-1', email: 'owner@example.com', name: 'Owner' });
    const response = await new Promise((resolve) => {
        const req = {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
            body: { url: 'https://example.org/recipe' },
        };
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
    assert.equal(response.status, 200);
    assert.equal(response.body.mode, 'structured');
    globalThis.fetch = realFetch;
    console.log('ok handler with stubbed fetch');
}

console.log('recipe import tests passed');
