#!/usr/bin/env node
/**
 * Ampi chat auto-scroll + Jump to latest pill (desktop + phone widths).
 * Requires: npm run build:web
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
};

function serveDist() {
    if (!existsSync(join(distDir, 'index.html'))) throw new Error('dist missing; run npm run build:web');
    const server = createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let file = normalize(join(distDir, pathname));
        if (!file.startsWith(distDir)) return res.writeHead(403).end();
        if (!existsSync(file) || statSync(file).isDirectory()) file = join(distDir, 'index.html');
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function onboard(page) {
    await page.goto(page.url().split('#')[0], { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Skip setup').click({ timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree', exact: true }).click({ timeout: 8000 });
    await page.waitForTimeout(600);
    for (const t of ['Skip tour', 'Got it', 'Not now']) {
        await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
    }
    await page.waitForTimeout(1200);
}

async function openAmpi(page) {
    await page.getByRole('tab', { name: 'Ampi' }).click({ timeout: 8000 }).catch(() => {});
    await page.getByLabel('Message to Ampi').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(1500);
}

async function nearBottom(page) {
    return page.evaluate(() => {
        const el = document.querySelector('[data-testid="ampi-chat-list"]');
        if (!el) return false;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        return distance < 96;
    });
}

async function scrollListUp(page, px = 400) {
    await page.evaluate((amount) => {
        const el = document.querySelector('[data-testid="ampi-chat-list"]');
        if (el) el.scrollTop = Math.max(0, el.scrollTop - amount);
    }, px);
    await page.waitForTimeout(300);
}

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

let server;
let browser;
try {
    server = await serveDist();
    const appUrl = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch({ headless: true });

    for (const [label, viewport] of [
        ['phone', { width: 390, height: 844 }],
        ['desktop', { width: 1280, height: 800 }],
    ]) {
        const context = await browser.newContext({
            viewport,
            isMobile: label === 'phone',
            hasTouch: label === 'phone',
        });
        await context.addInitScript(() => {
            window.__AMPI_SCROLL_TEST__ = true;
        });
        const page = await context.newPage();
        await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
        await onboard(page);
        await openAmpi(page);

        check(`${label}: seeded thread near bottom on load`, await nearBottom(page));

        await scrollListUp(page, 600);
        const pill = page.getByTestId('ampi-jump-latest');
        check(`${label}: jump pill visible after scroll up`, await pill.isVisible().catch(() => false));

        await pill.click();
        await page.waitForTimeout(500);
        check(`${label}: jump pill returns to bottom`, await nearBottom(page));

        const composer = page.getByLabel('Message to Ampi');
        await composer.fill('One more line for scroll pin');
        await page.getByLabel('Send', { exact: true }).click();
        await page.waitForTimeout(800);
        check(`${label}: stays pinned after send`, await nearBottom(page));

        await context.close();
    }
} catch (e) {
    console.error('FAIL:', e.message || e);
    failures += 1;
} finally {
    if (browser) await browser.close();
    if (server) server.close();
}

if (failures) process.exit(1);
console.log('All ampi scroll checks passed.');
