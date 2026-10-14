#!/usr/bin/env node
/**
 * Home-screen (standalone) tab bar sits on the bottom edge of the viewport.
 * Safe-area space is padding inside the bar. Safari-tab and desktop layouts stay put.
 *
 *   npm run build:web && node scripts/test-standalone-tabbar.mjs
 */
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright';
import { tabBarBottomInset } from '../src/layout/tabBarInset.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const shotDir = process.env.SHOTS_DIR || '/opt/cursor/artifacts/screenshots';
const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const OPFS_POLYFILL = `(function () {
    if (navigator.storage && typeof navigator.storage.getDirectory === 'function') return;
    if (!navigator.storage) navigator.storage = {};
    function makeDir() {
        const entries = new Map();
        return {
            kind: 'directory',
            async getDirectoryHandle(name, opts) {
                let child = entries.get(name);
                if (!child) {
                    if (!opts || !opts.create) throw new Error('not found');
                    child = makeDir();
                    entries.set(name, child);
                }
                return child;
            },
            async getFileHandle(name, opts) {
                let child = entries.get(name);
                if (!child) {
                    if (!opts || !opts.create) throw new Error('not found');
                    child = { kind: 'file', async createSyncAccessHandle() {
                        let bytes = new Uint8Array(0);
                        return {
                            read(buffer, opts) {
                                const at = (opts && opts.at) || 0;
                                const dest = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
                                const n = Math.max(0, Math.min(dest.byteLength, bytes.length - at));
                                if (n > 0) dest.set(bytes.subarray(at, at + n));
                                return n;
                            },
                            write(buffer, opts) {
                                const at = (opts && opts.at) || 0;
                                const src = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
                                const end = at + src.byteLength;
                                if (end > bytes.length) {
                                    const next = new Uint8Array(end);
                                    next.set(bytes);
                                    bytes = next;
                                }
                                bytes.set(src, at);
                                return src.byteLength;
                            },
                            flush() {},
                            truncate(size) {
                                if (size < bytes.length) bytes = bytes.slice(0, size);
                                else if (size > bytes.length) {
                                    const next = new Uint8Array(size);
                                    next.set(bytes);
                                    bytes = next;
                                }
                            },
                            getSize() { return bytes.length; },
                            close() {},
                        };
                    } };
                    entries.set(name, child);
                }
                return child;
            },
            async removeEntry(name) { entries.delete(name); },
            async *[Symbol.asyncIterator]() { for (const pair of entries) yield pair; },
        };
    }
    const root = makeDir();
    navigator.storage.getDirectory = async function () { return root; };
})();`;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
};

function serveDist() {
    if (!existsSync(join(distDir, 'index.html'))) throw new Error('dist missing; run npm run build:web');
    const server = createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (pathname === '/__opfs-worker.js') {
            const src = new URL(req.url, 'http://x').searchParams.get('src');
            res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(
                `${OPFS_POLYFILL}\nimportScripts(${JSON.stringify(src)});\n`
            );
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

async function installPage(context, standalone) {
    await context.addInitScript((flag) => {
        localStorage.setItem('amplifood.onboarding.v1', JSON.stringify({ completedAt: Date.now() }));
        localStorage.setItem('amplifood.legal.accepted', JSON.stringify({ version: '2026-10-09', acceptedAt: Date.now() }));
        localStorage.setItem('amplifood.dataConsent.v1', JSON.stringify({ platform: { grantedAt: Date.now() } }));
        const OriginalWorker = window.Worker;
        window.Worker = function Worker(url, opts) {
            const abs = new URL(String(url), location.href).href;
            const wrapper = new URL('/__opfs-worker.js', location.href);
            wrapper.searchParams.set('src', abs);
            return new OriginalWorker(wrapper.href, opts);
        };
        window.Worker.prototype = OriginalWorker.prototype;
        if (!flag) return;
        try {
            Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
        } catch {
            navigator.standalone = true;
        }
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
            const text = String(query);
            if (text.includes('display-mode: standalone') || text.includes('display-mode: fullscreen')) {
                return {
                    matches: true,
                    media: text,
                    onchange: null,
                    addListener() {},
                    removeListener() {},
                    addEventListener() {},
                    removeEventListener() {},
                    dispatchEvent() { return false; },
                };
            }
            return orig(query);
        };
    }, standalone);
}

async function measure(page) {
    return page.evaluate(() => {
        const root = document.getElementById('root');
        const bar = document.querySelector('[role="tablist"]');
        const barRect = bar ? bar.getBoundingClientRect() : null;
        const rootRect = root.getBoundingClientRect();
        const pad = (el) => (el ? getComputedStyle(el).paddingBottom : '');
        const margin = (el) => (el ? getComputedStyle(el).marginBottom : '');
        return {
            innerHeight: window.innerHeight,
            standaloneClass: document.documentElement.classList.contains('af-standalone'),
            wide: document.documentElement.classList.contains('af-layout-wide'),
            viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
            statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content') || '',
            htmlPad: pad(document.documentElement),
            bodyPad: pad(document.body),
            rootPad: pad(root),
            htmlMargin: margin(document.documentElement),
            bodyMargin: margin(document.body),
            rootMargin: margin(root),
            rootBottom: rootRect.bottom,
            barBottom: barRect ? barRect.bottom : null,
            barHeight: barRect ? barRect.height : null,
            barPad: bar ? pad(bar) : null,
            barMargin: bar ? margin(bar) : null,
            barInlinePad: bar ? bar.style.paddingBottom : null,
            vvHeight: window.visualViewport?.height ?? window.innerHeight,
            rootHeight: rootRect.height,
            rootMinHeight: getComputedStyle(root).minHeight,
            labelGap: (() => {
                const label = bar?.querySelector('[role="tab"]');
                if (!label) return null;
                return window.innerHeight - label.getBoundingClientRect().bottom;
            })(),
        };
    });
}

if (tabBarBottomInset(100, true) !== 34) throw new Error('standalone inset 100 was not capped at 34');
if (tabBarBottomInset(34, true) !== 34) throw new Error('standalone inset 34 changed');
if (tabBarBottomInset(0, true) !== 8) throw new Error('standalone inset 0');
if (tabBarBottomInset(0, false) !== 8) throw new Error('safari inset 0');
if (tabBarBottomInset(34, false) !== 34) throw new Error('non-standalone inset 34');
if (tabBarBottomInset(100, false) !== 100) throw new Error('safari must not cap a reported inset');

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

const gap = (m) => (m.barBottom == null ? Infinity : Math.abs(m.innerHeight - m.barBottom));

let server;
let browser;
try {
    server = await serveDist();
    const appUrl = `http://127.0.0.1:${server.address().port}/`;
    browser = await webkit.launch({ headless: true });

    async function openPhone(standalone, colorScheme = 'light') {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            userAgent: IPHONE_UA,
            colorScheme,
        });
        await installPage(context, standalone);
        const page = await context.newPage();
        await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.getByRole('tab', { name: 'Ampi' }).waitFor({ timeout: 45_000 });
        await page.waitForTimeout(400);
        return { context, page };
    }

    const standalone = await openPhone(true, 'dark');
    const stand = await measure(standalone.page);
    check('standalone class', stand.standaloneClass, JSON.stringify(stand));
    check('standalone viewport-fit=cover', stand.viewport.includes('viewport-fit=cover'), stand.viewport);
    check('status bar black-translucent', stand.statusBar === 'black-translucent', stand.statusBar);
    check('standalone shell has no bottom padding', stand.htmlPad === '0px' && stand.bodyPad === '0px' && stand.rootPad === '0px', `${stand.htmlPad} ${stand.bodyPad} ${stand.rootPad}`);
    check('standalone shell has no bottom margin', stand.htmlMargin === '0px' && stand.bodyMargin === '0px' && stand.rootMargin === '0px', `${stand.htmlMargin} ${stand.bodyMargin} ${stand.rootMargin}`);
    check('standalone shell matches the visual viewport', Math.abs(stand.rootHeight - stand.vvHeight) < 2, `root ${stand.rootHeight} vv ${stand.vvHeight}`);
    check('standalone root reaches the bottom', Math.abs(stand.innerHeight - stand.rootBottom) < 2, `root ${stand.rootBottom} viewport ${stand.innerHeight}`);
    check('standalone tab bar is flush', gap(stand) < 2, `bar ${stand.barBottom} viewport ${stand.innerHeight} pad ${stand.barPad}`);
    check('standalone pad is one small inset, not env() twice', stand.barMargin === '0px' && stand.barPad === '8px' && !/env\(/.test(stand.barInlinePad || ''), stand.barInlinePad || '');
    check('labels sit just above the bottom', stand.labelGap != null && stand.labelGap < 48, `label gap ${stand.labelGap}`);

    const grown = await standalone.page.evaluate(() => {
        const bar = document.querySelector('[role="tablist"]');
        const before = bar.getBoundingClientRect();
        bar.style.paddingBottom = '34px';
        const after = bar.getBoundingClientRect();
        return {
            bottomDelta: Math.abs(after.bottom - before.bottom),
            grew: after.height - before.height,
            viewportGap: Math.abs(window.innerHeight - after.bottom),
        };
    });
    check('extra safe-area padding stays inside the bar', grown.bottomDelta < 2 && grown.grew > 20 && grown.viewportGap < 2, JSON.stringify(grown));

    mkdirSync(shotDir, { recursive: true });
    const shot = join(shotDir, 'standalone-tab-bar.png');
    await standalone.page.screenshot({ path: shot, fullPage: false });
    check('screenshot', existsSync(shot), shot);
    await standalone.context.close();

    const safari = await openPhone(false);
    const tab = await measure(safari.page);
    check('safari tab is not standalone', !tab.standaloneClass);
    check('safari tab bar is flush', gap(tab) < 2, `bar ${tab.barBottom} viewport ${tab.innerHeight}`);
    check('safari tab keeps numeric safe-area padding', !/env\(safe-area-inset-bottom/.test(tab.barInlinePad || ''), tab.barInlinePad || '');
    await safari.context.close();

    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installPage(desktopContext, false);
    const desktop = await desktopContext.newPage();
    await desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await desktop.getByRole('link', { name: 'Recipes' }).waitFor({ timeout: 45_000 });
    const desk = await measure(desktop);
    check('desktop has no bottom tab bar', desk.barBottom == null && desk.wide, JSON.stringify({ wide: desk.wide, bar: desk.barBottom }));
    await desktopContext.close();
} catch (error) {
    console.error('FAIL:', error?.message || error);
    failures += 1;
} finally {
    if (browser) await browser.close();
    if (server) server.close();
}

if (failures) process.exit(1);
console.log('standalone tab bar ok');
