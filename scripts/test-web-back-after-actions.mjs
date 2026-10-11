#!/usr/bin/env node
/**
 * Headless Chrome at phone width: perform the usual actions on each main
 * screen (save, delete, generate, add, create) and check the header back
 * button still works afterwards — nothing left covering it, and tapping it
 * leaves the screen.
 *
 * Requires: npm run build:web. Serves dist itself, or set APP_URL to test a
 * running server.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const SHOTS = process.env.SHOTS_DIR || '';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
};

function serveDist() {
    if (!existsSync(join(distDir, 'index.html'))) {
        throw new Error('dist/index.html missing; run npm run build:web first');
    }
    const server = createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (pathname.startsWith('/api/')) {
            res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"not available in test"}');
            return;
        }
        let file = normalize(join(distDir, pathname));
        if (!file.startsWith(distDir)) {
            res.writeHead(403).end();
            return;
        }
        if (!existsSync(file) || statSync(file).isDirectory()) {
            const html = `${file.replace(/\/$/, '')}.html`;
            file = existsSync(html) ? html : join(distDir, 'index.html');
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

const RECIPE = JSON.stringify({
    title: 'Lasagna Soup',
    description: 'Cozy soup',
    servings: 4,
    prepTime: 10,
    cookTime: 30,
    ingredients: [
        { ingredient: 'Italian sausage', quantity: '1', unit: 'lb' },
        { ingredient: 'lasagna noodles', quantity: '8' },
    ],
    instructions: ['Brown sausage.', 'Simmer noodles.'],
});
const PIXEL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

let server;
let browser;
try {
    let appUrl = process.env.APP_URL;
    if (!appUrl) {
        server = await serveDist();
        appUrl = `http://127.0.0.1:${server.address().port}/`;
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.route('**/api/ai/chat', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        await new Promise((r) => setTimeout(r, 400));
        const payload = body.mode === 'image' ? { imageUri: PIXEL, model: 'fake' } : { text: RECIPE, model: 'fake' };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    const path = () => page.evaluate(() => location.pathname);
    const shot = async (name) => {
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
    };
    const settle = (ms = 800) => page.waitForTimeout(ms);
    const tap = (text) => page.locator(`text="${text}" >> visible=true`).last().click({ timeout: 8000 });
    const dismissTips = async () => {
        for (const t of ['Skip tour', 'Got it', 'Not now']) {
            await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
        }
    };
    const agreeConsent = async () => {
        for (const name of ['I agree', 'Allow', 'Agree']) {
            await page.getByRole('button', { name, exact: true }).click({ timeout: 600 }).catch(() => {});
        }
    };
    const openTab = async (name) => {
        await page.getByRole('tab', { name }).or(page.getByText(name, { exact: true })).last().click();
        await settle();
    };
    // Screens further down the stack stay mounted; pick the copy that's on top.
    const byLabel = async (label) => {
        const selector = `[aria-label="${label}"]`;
        const index = await page.evaluate((sel) => {
            return [...document.querySelectorAll(sel)].findIndex((el) => {
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height) return false;
                const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                return !!top && el.contains(top);
            });
        }, selector);
        return page.locator(selector).nth(Math.max(index, 0));
    };
    const modalOpen = () => page.locator('[aria-modal=true]').count();

    async function backWorks(label, expectPath) {
        await settle(300);
        check(`${label}: no dialog left open`, (await modalOpen()) === 0);
        const back = page.getByLabel('Go back').last();
        const box = await back.boundingBox();
        if (!box) {
            check(`${label}: back button visible`, false);
            return;
        }
        const hit = await page.evaluate(
            ({ x, y }) => {
                const el = document.elementFromPoint(x, y);
                return !!el?.closest('[aria-label="Go back"]');
            },
            { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        );
        check(`${label}: nothing covers the back button`, hit);
        const before = await path();
        await back.click({ timeout: 3000 }).catch(() => {});
        await settle(1000);
        const after = await path();
        check(
            `${label}: back leaves the screen`,
            expectPath ? expectPath.test(after) : after !== before,
            `${before} -> ${after}`
        );
        await shot(label.replace(/\W+/g, '-'));
    }

    await page.goto(appUrl);
    const skip = page.getByLabel('Skip setup');
    await skip.waitFor({ timeout: 45_000 });
    await skip.click();
    await settle();
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree' }).click({ timeout: 4000 }).catch(() => {});
    await settle(1200);
    await dismissTips();
    // A signed-in owner gets the AI proxy, which is stubbed above.
    await page.evaluate(() =>
        localStorage.setItem(
            'amplifood.owner.session.v1',
            JSON.stringify({ token: 't', email: 'owner@example.com', name: 'Owner', savedAt: Date.now() })
        )
    );
    await page.reload();
    await settle(3000);
    await dismissTips();

    // Recipes: empty import shows an error toast, then a real import opens a
    // choice dialog that Escape, a tap outside and its buttons all close.
    await openTab('Recipes');
    await page.getByLabel('Add recipe').click();
    await settle();
    await tap('Import Recipe');
    await settle(500);
    check('error toast shown for empty import', await page.getByRole('alert').first().isVisible().catch(() => false));
    check('toast is not modal', (await modalOpen()) === 0);
    await backWorks('add recipe after error toast');

    await page.getByLabel('Add recipe').click();
    await settle();
    await page.getByLabel('Recipe link or text').fill('Lasagna soup: sausage, noodles. Brown and simmer.');
    await tap('Import Recipe');
    await settle(1200);
    await agreeConsent();
    await page.getByText('Recipe imported successfully!').waitFor({ timeout: 10_000 });
    check('import success opens a dialog', (await modalOpen()) === 1);
    const focusInDialog = await page.evaluate(() => !!document.activeElement?.closest('[aria-modal=true]'));
    check('dialog moves focus inside', focusInDialog);
    let focusStayed = true;
    for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('Tab');
        focusStayed &&= await page.evaluate(() => {
            const el = document.activeElement;
            return !!el?.closest('[aria-modal=true]') && el.getAttribute('aria-hidden') !== 'true';
        });
    }
    check('Tab cycles through the dialog buttons only', focusStayed);
    const labelledBy = await page.locator('[aria-modal=true]').getAttribute('aria-labelledby');
    check('dialog is labelled by its title', !!labelledBy);
    await page.keyboard.press('Escape');
    await settle(500);
    check('Escape closes the dialog', (await modalOpen()) === 0);

    await page.getByLabel('Recipe link or text').fill('Lasagna soup: sausage, noodles. Brown and simmer.');
    await tap('Import Recipe');
    await page.getByText('Recipe imported successfully!').waitFor({ timeout: 10_000 });
    await page.mouse.click(12, 12);
    await settle(500);
    check('tap outside closes the dialog', (await modalOpen()) === 0);
    await backWorks('add recipe after dismissing dialog');

    await page.getByLabel('Add recipe').click();
    await settle();
    await page.getByLabel('Recipe link or text').fill('Lasagna soup: sausage, noodles. Brown and simmer.');
    await tap('Import Recipe');
    await page.getByText('Recipe imported successfully!').waitFor({ timeout: 10_000 });
    await tap('View Recipe');
    await settle(1500);
    check('View Recipe opens the recipe', /\/recipe\//.test(await path()), await path());
    const recipePath = await path();

    // Recipe detail: edit + save, generate image, then delete.
    await tap('Edit');
    await settle(500);
    await tap('Save');
    await settle(800);
    await backWorks('recipe after save', /\/add-recipe/);

    await page.goto(new URL(recipePath, appUrl).href);
    await settle(3000);
    await dismissTips();
    await tap('Edit');
    await settle(500);
    await tap('Generate');
    await settle(400);
    await agreeConsent();
    await settle(2000);
    await backWorks('recipe opened by link, after generating image', /\/recipes/);

    await page.locator('text="Lasagna Soup" >> visible=true').first().click();
    await settle(1500);
    const deleteRecipe = page.locator('text="Delete Recipe" >> visible=true').first();
    await deleteRecipe.click();
    await settle(500);
    check('delete asks for confirmation', (await modalOpen()) === 1);
    await page.keyboard.press('Escape');
    await settle(400);
    check('Escape cancels delete', (await modalOpen()) === 0 && /\/recipe\//.test(await path()));
    await deleteRecipe.click();
    await settle(500);
    await page.locator('[aria-modal=true]').getByText('Delete', { exact: true }).click();
    await settle(1200);
    check('delete returns to recipes', /\/recipes/.test(await path()), await path());
    check('no dialog after delete', (await modalOpen()) === 0);

    // Pantry: add, edit + save, delete.
    await openTab('Pantry');
    await page.getByLabel('Add pantry item').click();
    await settle();
    await page.getByLabel('Name', { exact: true }).fill('Rice');
    await tap('Save Item');
    await settle(1200);
    check('saving a pantry item returns to pantry', !/add/i.test(await path()), await path());
    check('no dialog after saving pantry item', (await modalOpen()) === 0);

    await page.getByLabel('Edit item').first().click();
    await settle();
    await page.getByLabel('Quantity', { exact: true }).fill('2');
    await tap('Update Item');
    await settle(1200);
    check('saving an edit returns to pantry', !/edit/i.test(await path()), await path());

    await page.getByLabel('Edit item').first().click();
    await settle();
    await backWorks('edit pantry item untouched');

    await page.getByLabel('Delete item').first().click();
    await settle(500);
    await page.locator('[aria-modal=true]').getByText('Delete', { exact: true }).click();
    await settle(800);
    check('no dialog after deleting pantry item', (await modalOpen()) === 0);

    // Grocery: add an item, pick "Done" from the follow-up dialog, then try the
    // dialog again and dismiss it and go back from the header instead.
    await openTab('Grocery');
    await page.getByLabel('Add grocery item').click();
    await settle();
    await page.getByLabel('Item name', { exact: true }).fill('Milk');
    await tap('Add Item');
    await page.getByText('Item added to grocery list').waitFor({ timeout: 8000 });
    await page.keyboard.press('Escape');
    await settle(400);
    await backWorks('grocery after add + dismiss');

    await page.getByLabel('Add grocery item').click();
    await settle();
    await page.getByLabel('Item name', { exact: true }).fill('Eggs');
    await tap('Add Item');
    await page.getByText('Item added to grocery list').waitFor({ timeout: 8000 });
    await tap('Done');
    await settle(1000);
    check('Done returns to grocery', (await modalOpen()) === 0 && !/add/i.test(await path()), await path());

    // Party: create one, then back.
    await (await byLabel('Open party')).click();
    await settle(1500);
    await dismissTips();
    await (await byLabel('Create a party')).click();
    await settle(600);
    await page.getByLabel('Party name').fill('Back test party');
    await tap('Create');
    await settle(1500);
    // Without a set-up account the create sheet stays open with an error; the
    // toast has to show above the sheet and the sheet must still close.
    const partyToast = page.locator('[role=alert],[role=status]').filter({ hasText: /party|user/i }).first();
    if (await partyToast.count()) {
        const box = await partyToast.boundingBox();
        const onTop = box
            ? await page.evaluate(
                  ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[role=alert],[role=status]'),
                  { x: box.x + box.width / 2, y: box.y + box.height / 2 }
              )
            : false;
        check('party toast shows above the create sheet', onTop);
        await page.keyboard.press('Escape');
        await settle(600);
    }
    await backWorks('party after create');

    // Account: open, then back.
    await openTab('Ampi');
    await dismissTips();
    await (await byLabel('Open account')).click();
    await settle(1500);
    await backWorks('account');

    // A screen opened straight from a link has no history to go back to.
    await page.goto(new URL('pantry/add', appUrl).href);
    await settle(3000);
    await dismissTips();
    await backWorks('pantry add opened by link', /\/pantry/);
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (error) {
    failures += 1;
    console.error('FAIL', error.message.split('\n').slice(0, 3).join(' '));
    if (SHOTS && browser) {
        const [page] = browser.contexts()[0]?.pages() || [];
        await page?.screenshot({ path: join(SHOTS, 'failure.png') }).catch(() => {});
    }
} finally {
    if (browser) await browser.close();
    if (server) server.close();
}

if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
}
console.log('\nback button works after actions on every screen');
