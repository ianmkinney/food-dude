#!/usr/bin/env node
/**
 * Open every main tab at mobile + desktop sizes (empty + seeded data).
 * Fails on ScreenErrorBoundary copy or uncaught page errors / console errors.
 *
 *   npm run build:web && npm run test:web-all-tabs
 *   APP_URL=https://amplifood.vercel.app npm run test:web-all-tabs
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
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
        if (!file.startsWith(distDir)) return res.writeHead(403).end();
        if (!existsSync(file) || statSync(file).isDirectory()) {
            const html = `${file.replace(/\/$/, '')}.html`;
            file = existsSync(html) ? html : join(distDir, 'index.html');
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

const BOUNDARY = /something went wrong/i;
const IGNORE_CONSOLE = /content security policy|report only/i;

async function onboard(page, appUrl) {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByLabel('Skip setup').click({ timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree', exact: true }).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    for (const t of ['Skip tour', 'Got it', 'Not now']) {
        await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
    }
    await page.waitForTimeout(1200);
}

async function assertHealthy(page, label) {
    const body = await page.locator('body').innerText();
    check(`${label}: no error boundary`, !BOUNDARY.test(body));
    check(`${label}: app booted`, !/could not start/i.test(body));
}

async function clickTopLabel(page, label) {
    const selector = `[aria-label="${label}"]`;
    const index = await page.evaluate((sel) => {
        return [...document.querySelectorAll(sel)].findIndex((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return false;
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return !!top && el.contains(top);
        });
    }, selector);
    await page.locator(selector).nth(Math.max(index, 0)).click({ timeout: 12_000 });
}

async function openMobileTab(page, name) {
    await page.getByRole('tab', { name }).or(page.getByText(name, { exact: true })).last().click({ timeout: 12_000 });
    await page.waitForTimeout(900);
}

async function openDesktopNav(page, name) {
    const link = page.getByRole('link', { name });
    await link.first().click({ timeout: 12_000 });
    await page.waitForTimeout(900);
}

async function visitMobileTabs(page, prefix, appUrl) {
    for (const tab of ['Ampi', 'Recipes', 'Planner', 'Pantry', 'Grocery']) {
        await openMobileTab(page, tab);
        await assertHealthy(page, `${prefix} mobile ${tab}`);
    }
    await clickTopLabel(page, 'Open party');
    await page.waitForTimeout(900);
    await assertHealthy(page, `${prefix} mobile Parties`);
    await page.goto(new URL('account', appUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await assertHealthy(page, `${prefix} mobile Account`);
}

async function visitDesktopTabs(page, prefix, appUrl) {
    for (const tab of ['Ampi', 'Recipes', 'Planner', 'Pantry', 'Grocery']) {
        await openDesktopNav(page, tab);
        await assertHealthy(page, `${prefix} desktop ${tab}`);
    }
    await page.goto(new URL('party', appUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await assertHealthy(page, `${prefix} desktop Parties`);
    await page.goto(new URL('account', appUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await assertHealthy(page, `${prefix} desktop Account`);
}

async function runScenario({ browserType, browserName, viewport, seeded, appUrl, visitTabs }) {
    const browser = await browserType.launch({ headless: true });
    const context = await browser.newContext({
        baseURL: appUrl,
        viewport,
        ...(viewport.width < 768 ? { isMobile: true, hasTouch: true } : {}),
        colorScheme: 'dark',
    });
    if (seeded) {
        await context.addInitScript(() => {
            globalThis.__DESKTOP_SCREENSHOT_SEED__ = true;
        });
    }
    const page = await context.newPage();
    await page.route('**/api/party*', async (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ parties: [] }),
        })
    );
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error' && !IGNORE_CONSOLE.test(msg.text())) consoleErrors.push(msg.text());
    });

    const tag = `${browserName} ${viewport.width}x${viewport.height} ${seeded ? 'seeded' : 'empty'}`;
    await onboard(page, appUrl);
    await page.waitForTimeout(seeded ? 4500 : 2000);

    await visitTabs(page, tag, appUrl);

    check(`${tag}: no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    check(`${tag}: no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

    await browser.close();
}

let server;
try {
    let appUrl = process.env.APP_URL;
    if (!appUrl) {
        server = await serveDist();
        appUrl = `http://127.0.0.1:${server.address().port}/`;
    }

    let browserType = chromium;
    let browserName = 'chromium';
    if (process.env.PLAYWRIGHT_BROWSER === 'webkit') {
        try {
            await webkit.launch({ headless: true });
            browserType = webkit;
            browserName = 'webkit';
        } catch {
            console.log('WebKit unavailable; using Chromium');
        }
    }

    for (const seeded of [false, true]) {
        await runScenario({
            browserType,
            browserName,
            viewport: { width: 390, height: 844 },
            seeded,
            appUrl,
            visitTabs: visitMobileTabs,
        });
        await runScenario({
            browserType,
            browserName,
            viewport: { width: 1280, height: 900 },
            seeded,
            appUrl,
            visitTabs: visitDesktopTabs,
        });
    }
} catch (e) {
    console.error('FAIL:', e.message || e);
    failures += 1;
} finally {
    if (server) server.close();
}

if (failures) process.exit(1);
console.log('all-tabs smoke passed');
