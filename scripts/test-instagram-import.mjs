#!/usr/bin/env node
/**
 * Instagram import tests: fixture parsing (always) + optional live fetch.
 * Run: node scripts/test-instagram-import.mjs
 */
import assert from 'node:assert/strict';

const {
    buildInstagramImportPayload,
    extractAuthorFromHtml,
    extractCaptionFromHtml,
    importInstagramPost,
    isInstagramPostUrl,
} = await import('../api/lib/instagramImport.js');

const FIXTURE = `<!DOCTYPE html><html><head>
<meta property="og:title" content="ChefNina on Instagram: &quot;Creamy tuscan chicken&quot;" />
<meta property="og:description" content="Creamy tuscan chicken 🍗&#10;&#10;Ingredients:&#10;- 2 chicken breasts&#10;- 1 cup cream&#10;&#10;Steps:&#10;1. Sear chicken&#10;2. Simmer sauce" />
<meta property="og:image" content="https://cdn.example/photo.jpg" />
</head><body></body></html>`;

const caption = extractCaptionFromHtml(FIXTURE);
assert.ok(caption.includes('Ingredients'), 'og:description caption');
assert.equal(extractAuthorFromHtml(FIXTURE), 'ChefNina');

const built = buildInstagramImportPayload({
    caption,
    image: 'https://cdn.example/photo.jpg',
    author: 'ChefNina',
    sourceUrl: 'https://www.instagram.com/p/ABC123/',
});
assert.ok(built.text.includes('Sear chicken'));
assert.equal(built.author, 'ChefNina');

const bioFixture = `<html><head><meta property="og:description" content="Full recipe in bio 🔗" /></head></html>`;
const bioPayload = buildInstagramImportPayload({
    caption: extractCaptionFromHtml(bioFixture),
    image: null,
    author: null,
    sourceUrl: 'https://www.instagram.com/p/BIO123/',
});
assert.ok(bioPayload.text.includes('recipe in the bio'), 'bio warning');

const jsonFixture = `<html><script>{"edge_media_to_caption":{"edges":[{"node":{"text":"Taco night!\\n1 lb beef\\n8 tortillas"}}]}}</script></html>`;
assert.ok(extractCaptionFromHtml(jsonFixture).includes('Taco night'));

assert.ok(isInstagramPostUrl('https://www.instagram.com/reel/DBwlLNhuw8X/'));
assert.ok(isInstagramPostUrl('https://www.instagram.com/karancooks/reel/DEDWV8OufjW/'));

const LIVE = [
    'https://www.instagram.com/reel/DBwlLNhuw8X/',
    'https://www.instagram.com/reel/DBWgt3Qv5Km/',
    'https://www.instagram.com/karancooks/reel/DEDWV8OufjW/',
];

let liveOk = 0;
for (const url of LIVE) {
    try {
        const result = await importInstagramPost(url);
        assert.ok(result.text.length > 20);
        console.log('live ok', url, result.author || '(no author)', result.text.slice(0, 60).replace(/\s+/g, ' '), '…');
        liveOk += 1;
    } catch (error) {
        const code = error?.message || '';
        console.log('live skip', url, code);
        assert.ok(
            code === 'instagram_login_wall' || code === 'instagram_no_caption',
            `unexpected live error ${code}`,
        );
    }
}
console.log(`fixture checks passed (${liveOk}/${LIVE.length} live captions)`);

process.env.SESSION_SECRET = 'local-test-secret';
process.env.ALLOWED_EMAILS = 'owner@example.com';
const { signSession } = await import('../api/lib/session.js');
const { default: importHandler } = await import('../api/recipes/import.js');
const token = await signSession({ sub: 'g-1', email: 'owner@example.com', name: 'Owner' });

function callImport(body) {
    const req = { method: 'POST', headers: { authorization: `Bearer ${token}` }, body };
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
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

const api = await callImport({ url: LIVE[0] });
assert.ok(api.status === 200 || api.status === 404 || api.status === 422, `handler status ${api.status}`);
if (api.status === 200) {
    assert.equal(api.body.sourcePlatform, 'instagram');
    assert.ok(api.body.text);
}
console.log('handler instagram path ok');
