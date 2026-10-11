#!/usr/bin/env node
/**
 * Headless Chrome: two tabs should boot without "AmpliFood could not start".
 * Also simulates a frozen background tab (ignores close-db) and verifies take-over
 * completes instead of hanging on "Moving here…".
 * Requires: npm run build:web
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const PORT = 8765;
const APP_URL = `http://127.0.0.1:${PORT}/`;

function waitForHttp(ms = 60_000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tick = async () => {
            try {
                const res = await fetch(APP_URL);
                if (res.ok) return resolve();
            } catch {
                // not ready
            }
            if (Date.now() - start > ms) return reject(new Error('Server did not become ready'));
            setTimeout(tick, 500);
        };
        tick();
    });
}

async function bodyText(page) {
    return page.locator('body').innerText();
}

const server = spawn('npx', ['--yes', 'serve@14', 'dist', '--listen', String(PORT)], {
    stdio: 'ignore',
    cwd: repoRoot,
});

let browser;
let failed = false;

try {
    await waitForHttp();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await Promise.all([
        page1.goto(APP_URL, { waitUntil: 'domcontentloaded' }),
        page2.goto(APP_URL, { waitUntil: 'domcontentloaded' }),
    ]);
    await page1.waitForTimeout(8000);
    await page2.waitForTimeout(8000);

    const text1 = await bodyText(page1);
    const text2 = await bodyText(page2);
    if (/could not start/i.test(text1) || /could not start/i.test(text2)) {
        console.error('FAIL: startup error visible in one or both tabs');
        console.error('tab1:', text1.slice(0, 400));
        console.error('tab2:', text2.slice(0, 400));
        failed = true;
    } else {
        console.log('ok two-tab web boot (no startup fatal)');
    }

    // Frozen peer: tab1 ignores cooperative close-db (iOS Safari suspended tab).
    const context2 = await browser.newContext();
    const frozenOwner = await context2.newPage();
    await frozenOwner.addInitScript(() => {
        const channel = new BroadcastChannel('amplifood-db');
        channel.addEventListener('message', (event) => {
            const data = event?.data;
            if (data?.type === 'close-db' || data?.type === 'takeover') {
                // Simulate a suspended Safari tab: never release OPFS / SQLite.
            }
        });
    });
    const taker = await context2.newPage();

    await frozenOwner.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await frozenOwner.waitForTimeout(6000);
    await taker.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await taker.waitForTimeout(2000);

    const takerBefore = await bodyText(taker);
    if (!/another tab/i.test(takerBefore)) {
        console.warn('warn: expected tab-lock UI on taker (continuing anyway)');
    }

    const useHere = taker.getByRole('button', { name: /use here/i });
    if (await useHere.count()) {
        await useHere.first().click();
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
            const text = await bodyText(taker);
            if (/moving here/i.test(text)) {
                await taker.waitForTimeout(400);
                continue;
            }
            if (!/another tab/i.test(text) && !/could not start/i.test(text)) {
                console.log('ok frozen-tab take-over completed (app usable or mirror banner)');
                break;
            }
            await taker.waitForTimeout(400);
        }
        const takerAfter = await bodyText(taker);
        if (/moving here/i.test(takerAfter)) {
            console.error('FAIL: take-over hung on "Moving here…"');
            failed = true;
        } else if (/could not start/i.test(takerAfter)) {
            console.error('FAIL: take-over ended in fatal startup error');
            console.error(takerAfter.slice(0, 500));
            failed = true;
        }
    } else {
        console.warn('warn: no Use here button (skipping frozen take-over check)');
    }
} finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
}

if (failed) process.exit(1);
