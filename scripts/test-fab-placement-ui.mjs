#!/usr/bin/env node
/**
 * Mobile web: the add button defaults to the bottom-right, pantry delete stays
 * clear, a 3s hold drags it, and Account reset restores the shared position.
 *
 *   npm run build:web && npm run test:fab-placement-ui
 */
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
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
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

function serveDist() {
    if (!existsSync(join(distDir, 'index.html'))) {
        throw new Error('dist/index.html missing; run npm run build:web first');
    }
    const server = createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (pathname === '/__opfs-worker.js') {
            const src = new URL(req.url, 'http://x').searchParams.get('src');
            res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(
                `${OPFS_POLYFILL}\nimportScripts(${JSON.stringify(src)});\n`
            );
            return;
        }
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

function overlaps(a, b) {
    if (!a || !b) return false;
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function onboard(page, appUrl) {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByLabel('Skip setup').click({ timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree', exact: true }).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    for (const t of ['Skip tour', 'Got it', 'Not now']) {
        await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
    }
    await page.waitForTimeout(800);
}

async function fabBox(page) {
    const cluster = page.locator('[data-testid="fab-add"]');
    await cluster.waitFor({ timeout: 20_000 });
    return cluster.boundingBox();
}

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

async function runBrowser(browserType, name, appUrl) {
    const browser = await browserType.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        userAgent:
            name === 'webkit'
                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
                : undefined,
    });
    const page = await context.newPage();
    const prefix = name;
    try {
        await page.addInitScript(`${OPFS_POLYFILL}
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
            globalThis.__DESKTOP_SCREENSHOT_SEED__ = true;
        `);
        await onboard(page, appUrl);
        await page.goto(new URL('pantry', appUrl).href, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        const add = await fabBox(page);
        const viewport = page.viewportSize();
        check(`${prefix} pantry + is on the right`, !!add && add.x > viewport.width * 0.55, `x=${add?.x}`);
        check(
            `${prefix} pantry + is above the bottom edge`,
            !!add && add.y + add.height < viewport.height - 40,
            `bottom=${add ? add.y + add.height : '?'}`
        );

        const tab = page.getByRole('tab', { name: 'Pantry' });
        const tabBox = await tab.boundingBox();
        if (tabBox && add) {
            check(
                `${prefix} pantry + sits above the tab bar`,
                add.y + add.height <= tabBox.y + 2,
                `fabBottom=${Math.round(add.y + add.height)} tabTop=${Math.round(tabBox.y)}`
            );
        } else {
            check(`${prefix} pantry tab bar measurable`, false);
        }

        const expand = page.getByRole('button', { name: /^Expand / }).first();
        if (await expand.count()) await expand.click();
        await page.waitForTimeout(600);
        const del = page.getByRole('button', { name: 'Delete item' }).first();
        const delBox = await del.boundingBox().catch(() => null);
        const addAfter = await fabBox(page);
        check(`${prefix} pantry delete is visible`, !!delBox, delBox ? '' : 'missing');
        if (delBox && addAfter) {
            check(
                `${prefix} pantry delete is left of the +`,
                delBox.x + delBox.width <= addAfter.x + 1,
                `deleteRight=${Math.round(delBox.x + delBox.width)} fabLeft=${Math.round(addAfter.x)}`
            );
            check(`${prefix} pantry delete does not overlap the +`, !overlaps(delBox, addAfter));
        }
        if (name === 'chromium') {
            mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });
            await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/pantry-fab-right-390.png' });
        }

        const before = await fabBox(page);
        const holdX = before.x + before.width / 2;
        const holdY = before.y + before.height / 2;
        await page.mouse.move(holdX, holdY);
        await page.mouse.down();
        await page.waitForTimeout(3200);
        const placing = await page.locator('[data-testid="fab-cluster"]').getAttribute('data-placing');
        const jiggling = await page.locator('.af-fab-jiggle').count();
        check(`${prefix} 3s hold enters placement`, placing === 'true', `data-placing=${placing}`);
        check(`${prefix} placement wiggles the button`, jiggling > 0, `count=${jiggling}`);
        await page.mouse.move(holdX - 150, holdY - 220, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        const moved = await fabBox(page);
        check(
            `${prefix} drag moves the +`,
            !!moved && Math.hypot(moved.x - before.x, moved.y - before.y) > 40,
            `dx=${moved ? Math.round(moved.x - before.x) : '?'}`
        );
        const stored = await page.evaluate(() => localStorage.getItem('amplifood.fabPosition'));
        const parsed = stored ? JSON.parse(stored) : null;
        check(
            `${prefix} position saved as normalized coords`,
            !!parsed && parsed.x >= 0 && parsed.x <= 1 && parsed.y >= 0 && parsed.y <= 1,
            stored || 'missing'
        );
        check(`${prefix} long-press release does not open add`, (await page.getByText('Add Pantry Item').count()) === 0);

        const still = await page.locator('[data-testid="fab-cluster"]').getAttribute('data-placing');
        check(`${prefix} release stays in placement`, still === 'true', `data-placing=${still}`);
        const parked = await fabBox(page);
        await page.mouse.click(parked.x + parked.width / 2, parked.y + parked.height / 2);
        await page.waitForTimeout(500);
        const afterTap = await page.locator('[data-testid="fab-cluster"]').getAttribute('data-placing');
        check(
            `${prefix} tap while placing exits without opening add`,
            afterTap === 'false' && !page.url().includes('/pantry/add'),
            `placing=${afterTap} url=${page.url()}`
        );

        await page.goto(new URL('recipes', appUrl).href, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        const recipeFab = await fabBox(page);
        check(
            `${prefix} recipes share the dragged position`,
            !!recipeFab && Math.abs(recipeFab.x - moved.x) < 40 && Math.abs(recipeFab.y - moved.y) < 50,
            `pantry=(${Math.round(moved.x)},${Math.round(moved.y)}) recipes=(${recipeFab ? Math.round(recipeFab.x) : '?'},${recipeFab ? Math.round(recipeFab.y) : '?'})`
        );

        await page.setViewportSize({ width: 700, height: 500 });
        await page.waitForTimeout(500);
        const resized = await fabBox(page);
        check(
            `${prefix} resize keeps the button on screen`,
            !!resized && resized.x > 20 && resized.x < 640 && resized.y > 0 && resized.y < 460,
            `x=${resized?.x} y=${resized?.y} norm=${parsed?.x}`
        );

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(new URL('grocery', appUrl).href, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        const secondary = await page.locator('[data-testid="fab-secondary"]').boundingBox();
        const groceryAdd = await fabBox(page);
        check(
            `${prefix} grocery groups sparkles left of +`,
            !!secondary && !!groceryAdd && secondary.x + secondary.width <= groceryAdd.x + 1,
            `sparkles=${secondary?.x} add=${groceryAdd?.x}`
        );

        await page.goto(new URL('account', appUrl).href, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByText('Reset button position', { exact: true }).click();
        await page.waitForTimeout(400);
        const cleared = await page.evaluate(() => localStorage.getItem('amplifood.fabPosition'));
        check(`${prefix} account reset clears the saved position`, cleared == null, cleared || '');

        await page.goto(new URL('pantry', appUrl).href, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
        const restored = await fabBox(page);
        check(`${prefix} reset returns + to the right`, !!restored && restored.x > 200, `x=${restored?.x}`);

        await page.locator('[data-testid="fab-add"]').click();
        await page.waitForURL(/pantry\/add/, { timeout: 8000 });
        check(`${prefix} short tap opens add`, page.url().includes('/pantry/add'), page.url());
    } catch (error) {
        check(`${prefix} flow`, false, error?.message || String(error));
    } finally {
        await browser.close();
    }
}

async function main() {
    const server = await serveDist();
    const { port } = server.address();
    const appUrl = `http://127.0.0.1:${port}/`;
    const only = process.env.FAB_BROWSER;
    const types = [['chromium', chromium]].filter(([name]) => !only || name === only);
    try {
        const probe = await webkit.launch({ headless: true });
        await probe.close();
        if (!only || only === 'webkit') types.push(['webkit', webkit]);
    } catch (error) {
        console.log(`skip webkit (${error?.message || error})`);
    }
    try {
        for (const [name, type] of types) {
            await runBrowser(type, name, appUrl);
        }
    } finally {
        server.close();
    }
    if (failures) {
        console.error(`\n${failures} fab UI check(s) failed`);
        process.exit(1);
    }
    console.log('\nfab UI checks passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
