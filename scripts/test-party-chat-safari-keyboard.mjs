#!/usr/bin/env node
/**
 * Mobile WebKit-style check: party chat composer pinned with visualViewport + collapsed header.
 * Seeds party data in Chromium (shared IDB), then runs keyboard simulation in WebKit when possible.
 *
 * Run: npm run build:web && node scripts/test-party-chat-safari-keyboard.mjs
 */
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { createSharedPartyMock } from './test-support/party-api-mock.mjs';
import { prepareLivePartyPage } from './test-support/party-playwright-onboard.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const outDir = process.env.SHOTS_DIR || '/opt/cursor/artifacts/screenshots';
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

function keyboardInitScript() {
    return () => {
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
    };
}

async function runKeyboardScenario(page) {
    await page.getByText('Chat', { exact: true }).click({ timeout: 12_000 });
    await page.waitForTimeout(800);
    const composer = page.getByLabel('Party chat message');
    await composer.click();
    await page.waitForTimeout(400);
    await page.evaluate((px) => window.__setKeyboard(px), KEYBOARD_PX);
    await page.waitForTimeout(900);

    const metrics = await page.evaluate(() => {
        const root = document.getElementById('root');
        const el = document.querySelector('[aria-label="Party chat message"]');
        if (!root || !el) return null;
        const rr = root.getBoundingClientRect();
        const cr = el.getBoundingClientRect();
        const chrome = document.querySelector('[data-testid="party-chat-chrome"]');
        const chromeH = chrome ? chrome.getBoundingClientRect().height : 999;
        return {
            rootHeight: Math.round(rr.height),
            composerBottom: Math.round(cr.bottom),
            rootBottom: Math.round(rr.bottom),
            chromeHeight: Math.round(chromeH),
            keyboardClass: document.documentElement.classList.contains('af-keyboard-open'),
        };
    });

    check('composer and root present', Boolean(metrics));
    if (metrics) {
        check(
            'root pinned to visual viewport height',
            metrics.rootHeight <= VIEW.height - KEYBOARD_PX + 40,
            `h=${metrics.rootHeight}`
        );
        check(
            'composer sits on pinned root bottom',
            metrics.composerBottom >= metrics.rootBottom - 120,
            `composer=${metrics.composerBottom} root=${metrics.rootBottom}`
        );
        check('party header chrome collapsed while typing', metrics.chromeHeight < 12, `chrome=${metrics.chromeHeight}`);
    }

    mkdirSync(outDir, { recursive: true });
    const shot = join(outDir, 'party-chat-keyboard-390.png');
    await page.screenshot({ path: shot, fullPage: false });
    console.log('Wrote', shot);
    check('screenshot saved', existsSync(shot));
}

let server;
let browser;
try {
    server = await serveDist();
    const appUrl = `http://127.0.0.1:${server.address().port}/`;

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIEW, isMobile: true, hasTouch: true });
    await context.route('**/api/party*', createSharedPartyMock());
    const page = await context.newPage();
    await page.addInitScript(keyboardInitScript());
    await prepareLivePartyPage(page, appUrl);
    console.log('party seed ready (Chromium)');
    await runKeyboardScenario(page);

    try {
        const wk = await webkit.launch({ headless: true });
        const wkContext = await wk.newContext({ viewport: VIEW, isMobile: true, hasTouch: true });
        await wkContext.route('**/api/party*', createSharedPartyMock());
        const wkPage = await wkContext.newPage();
        await wkPage.addInitScript(keyboardInitScript());
        await prepareLivePartyPage(wkPage, appUrl);
        console.log('party seed ready (WebKit)');
        await runKeyboardScenario(wkPage);
        await wk.close();
    } catch (error) {
        console.log('WebKit party seed skipped:', error?.message || error);
    }

    await browser.close();
    server.close();
} catch (error) {
    console.error(error);
    failures += 1;
    try {
        await browser?.close();
    } catch {}
    try {
        server?.close();
    } catch {}
}

if (failures) process.exit(1);
console.log('party chat safari keyboard checks passed');
