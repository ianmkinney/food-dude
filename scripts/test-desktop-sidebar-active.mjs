#!/usr/bin/env node
/**
 * Desktop sidebar highlight should match navigation on the first click (#54).
 * Requires: npm run build:web
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8771;
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

const server = spawn('npx', ['--yes', 'serve@14', 'dist', '--listen', String(PORT)], {
    stdio: 'ignore',
    cwd: repoRoot,
});

let browser;
let failed = false;

try {
    await waitForHttp();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Skip setup').click({ timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree', exact: true }).click({ timeout: 8000 });
    await page.waitForTimeout(800);
    for (const t of ['Skip tour', 'Got it', 'Not now']) {
        await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
    }
    await page.waitForTimeout(2000);

    const pantryLink = page.getByRole('link', { name: 'Pantry' });
    await pantryLink.waitFor({ state: 'visible', timeout: 20_000 });
    await pantryLink.click();
    await page.waitForTimeout(600);

    const selected = await pantryLink.getAttribute('aria-current');
    const selectedState = await pantryLink.evaluate((el) => el.getAttribute('aria-current') || el.closest('[aria-selected]')?.getAttribute('aria-selected'));
    const isActive =
        selected === 'page' ||
        selectedState === 'true' ||
        (await pantryLink.evaluate((el) => {
            const bg = getComputedStyle(el).backgroundColor;
            return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
        }));

    if (!isActive) {
        console.error('FAIL: Pantry sidebar item not active after first click');
        failed = true;
    } else {
        console.log('ok sidebar active on first navigation click');
    }

    await page.getByRole('link', { name: 'Recipes' }).click();
    await page.waitForTimeout(600);
    const recipesLink = page.getByRole('link', { name: 'Recipes' });
    const recipesActive = await recipesLink.evaluate((el) => {
        if (el.getAttribute('aria-current') === 'page' || el.getAttribute('aria-selected') === 'true') return true;
        const bg = getComputedStyle(el).backgroundColor;
        return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    });
    if (!recipesActive) {
        console.error('FAIL: Recipes not active after first click');
        failed = true;
    } else {
        console.log('ok recipes highlight updates on first click');
    }
} catch (e) {
    console.error('FAIL:', e.message || e);
    failed = true;
} finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
}

process.exit(failed ? 1 : 0);
