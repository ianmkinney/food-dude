#!/usr/bin/env node
/**
 * WebKit (Safari-like) check: visualViewport pin + single-line empty composer.
 * Run: npm run build:web && node scripts/test-web-safari-composer.mjs
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const KEYBOARD_PX = 336;
const VIEW = { width: 390, height: 844 };

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
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

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

let server;
let browser;
try {
    server = await serveDist();
    const appUrl = `http://127.0.0.1:${server.address().port}/`;
    try {
        browser = await webkit.launch({ headless: true });
        console.log('using Playwright WebKit');
    } catch {
        browser = await chromium.launch({ headless: true });
        console.log('WebKit unavailable in this environment; using Chromium mobile emulation');
    }
    const context = await browser.newContext({ viewport: VIEW, isMobile: true, hasTouch: true });
    const page = await context.newPage();

    await page.addInitScript(() => {
        const fake = new EventTarget();
        fake.height = window.innerHeight;
        fake.width = window.innerWidth;
        fake.offsetTop = 0;
        fake.offsetLeft = 0;
        fake.pageTop = 0;
        fake.scale = 1;
        Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
        window.__setKeyboard = (px) => {
            fake.height = window.innerHeight - px;
            fake.offsetTop = 0;
            fake.dispatchEvent(new Event('resize'));
            fake.dispatchEvent(new Event('scroll'));
        };
    });

    await page.goto(appUrl);
    await page.getByLabel('Skip setup').click({ timeout: 45_000 });
    await page.waitForTimeout(600);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree' }).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1000);
    for (const t of ['Skip tour', 'Got it', 'Not now']) {
        await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
    }
    await page.getByRole('tab', { name: 'Ampi' }).click({ timeout: 8000 }).catch(() => {});

    const composer = page.getByLabel('Message to Ampi');
    await composer.click();
    await page.waitForTimeout(300);

    const emptyHeight = await page.evaluate(() => {
        const el = document.querySelector('[aria-label="Message to Ampi"]');
        return el ? Math.round(el.getBoundingClientRect().height) : 0;
    });
    check('empty composer is about one line tall', emptyHeight > 0 && emptyHeight <= 60, `height ${emptyHeight}`);

    await page.evaluate((px) => window.__setKeyboard(px), KEYBOARD_PX);
    await page.waitForTimeout(400);

    const metrics = await page.evaluate((keyboardTop) => {
        const root = document.getElementById('root');
        const el = document.querySelector('[aria-label="Message to Ampi"]');
        let wrap = el;
        for (let i = 0; i < 4 && wrap?.parentElement; i += 1) wrap = wrap.parentElement;
        const rootRect = root?.getBoundingClientRect();
        const wrapRect = wrap?.getBoundingClientRect();
        return {
            rootBottom: rootRect ? Math.round(rootRect.bottom) : 0,
            composerBottom: wrapRect ? Math.round(wrapRect.bottom) : 0,
            keyboardTop,
            rootHeight: rootRect ? Math.round(rootRect.height) : 0,
            vvHeight: window.visualViewport?.height ?? 0,
        };
    }, VIEW.height - KEYBOARD_PX);

    check('root height matches visual viewport', Math.abs(metrics.rootHeight - metrics.vvHeight) <= 2, JSON.stringify(metrics));
    check(
        'composer flush with keyboard top',
        Math.abs(metrics.composerBottom - metrics.keyboardTop) <= 4,
        `composer ${metrics.composerBottom}, keyboard ${metrics.keyboardTop}`
    );
    check(
        'root bottom flush with keyboard top',
        Math.abs(metrics.rootBottom - metrics.keyboardTop) <= 4,
        `root ${metrics.rootBottom}`
    );
} finally {
    await browser?.close().catch(() => {});
    server?.close();
}

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('Safari-style composer checks passed');
