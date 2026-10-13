#!/usr/bin/env node
/**
 * Browser e2e at 390px: "@Ampi suggest a mexican dinner" shows a non-empty
 * Ampi reply and a recipe card even when the model returns reply: "".
 * Requires: npm run build:web
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createSharedPartyMock } from './test-support/party-api-mock.mjs';
import { prepareLivePartyPage } from './test-support/party-playwright-onboard.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = process.env.SHOTS_DIR || '/opt/cursor/artifacts/screenshots';

const EMPTY_REPLY_TURN = JSON.stringify({
    reply: '',
    actions: [
        {
            tool: 'create_recipe',
            args: {
                title: 'Mexican Street Corn Bowls',
                servings: 4,
                description: 'Charred corn with lime and cheese.',
                ingredients: [
                    { ingredient: 'corn', quantity: '3', unit: 'cups' },
                    { ingredient: 'cotija cheese', quantity: '1/2', unit: 'cup' },
                    { ingredient: 'lime', quantity: '2', unit: '' },
                ],
                instructions: ['Char the corn', 'Toss with lime', 'Top with cheese'],
            },
        },
    ],
});

async function startServe() {
    const distDir = join(repoRoot, 'dist');
    if (!existsSync(join(distDir, 'index.html'))) {
        throw new Error('dist missing; run npm run build:web first');
    }
    return new Promise((resolve, reject) => {
        const child = spawn('npx', ['--yes', 'serve@14', 'dist', '--single', '--listen', '0'], {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const onData = (chunk) => {
            const m = String(chunk).match(/http:\/\/(?:127\.0\.0\.1|localhost):(\d+)/);
            if (m) resolve({ child, url: `http://127.0.0.1:${m[1]}/` });
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', reject);
        setTimeout(() => reject(new Error('serve timeout')), 30_000);
    });
}

async function main() {
    mkdirSync(shotDir, { recursive: true });
    const { child: server, url: appUrl } = await startServe();
    const browser = await chromium.launch({ headless: true });
    const handler = createSharedPartyMock();
    let failed = false;

    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.route('**/api/party*', handler);
        let aiHits = 0;
        await context.route('**/api/ai/chat', (route) => {
            aiHits += 1;
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ text: EMPTY_REPLY_TURN }),
            });
        });
        await context.route('**/api/auth/session', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    email: 'alex@example.com',
                    name: 'Alex Cook',
                    platformAiAllowed: true,
                }),
            })
        );

        const page = await context.newPage();
        page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
        await prepareLivePartyPage(page, appUrl, 'member-token-alex');
        await page.getByText('Chat', { exact: true }).click();
        await page.getByPlaceholder(/Message the party/i).waitFor({ timeout: 20_000 });

        await page.getByRole('button', { name: 'Ask Ampi' }).click();
        const prefilled = await page.getByPlaceholder(/Message the party/i).inputValue();
        if (!/@Ampi give us a delicious meal from our pantries/i.test(prefilled)) {
            console.error('FAIL: Ask Ampi did not prefill the pantry prompt:', prefilled);
            failed = true;
        } else {
            console.log('ok Ask Ampi prefill');
        }
        await page.screenshot({ path: join(shotDir, 'party-ask-ampi-prefill-390.png'), fullPage: false });

        const input = page.getByPlaceholder(/Message the party/i);
        await input.fill('@Ampi suggest a mexican dinner');
        await page.getByLabel('Send').click();

        try {
            await page.getByText('Mexican Street Corn Bowls', { exact: true }).waitFor({ timeout: 25_000 });
            await page.getByText(/Here's a Mexican Street Corn Bowls idea for the party/i).waitFor({ timeout: 5_000 });
            await page.getByText('Save to my recipes').waitFor({ timeout: 5_000 });
            await page.getByText('Add to party meals').waitFor({ timeout: 5_000 });
            console.log('ok mexican dinner card and non-empty reply');
        } catch (error) {
            const body = await page.locator('body').innerText().catch(() => '');
            console.error('FAIL: mexican dinner card did not appear', error?.message || error);
            console.error('ai chat hits', aiHits);
            console.error('PAGE TEXT:\n', body.slice(0, 2500));
            failed = true;
        }
        await page.screenshot({ path: join(shotDir, 'party-ampi-mexican-card-390.png'), fullPage: false });

        await input.fill("I'll bring the tortillas");
        await page.getByLabel('Send').click();
        try {
            await page.getByText(/will bring the tortillas/i).waitFor({ timeout: 15_000 });
            console.log('ok claim confirmation');
        } catch (error) {
            console.error('FAIL: claim confirmation missing', error?.message || error);
            failed = true;
        }
        await page.screenshot({ path: join(shotDir, 'party-claim-tortillas-390.png'), fullPage: false });

        const shareToggle = page.getByText('Share my pantry with this party');
        if (!(await shareToggle.count())) {
            console.error('FAIL: pantry share toggle missing');
            failed = true;
        } else {
            console.log('ok pantry share toggle');
            await shareToggle.scrollIntoViewIfNeeded();
            await page.screenshot({ path: join(shotDir, 'party-pantry-share-390.png'), fullPage: false });
        }

        await context.close();
    } finally {
        await Promise.race([
            browser.close(),
            new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
        server.kill('SIGTERM');
    }

    if (failed) process.exit(1);
    console.log('party ampi mexican playwright checks passed');
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
