#!/usr/bin/env node
/**
 * Home-screen header shows Refresh. A browser tab does not.
 * The logo stays clear of the icons on a 390px screen.
 *
 *   npm run build:web && npm run test:standalone-refresh
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
    '.ttf': 'font/ttf',
};

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

function serveDist() {
    if (!existsSync(join(distDir, 'index.html'))) throw new Error('dist missing; run npm run build:web first');
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
    await page.waitForTimeout(500);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree', exact: true }).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
}

async function headerBoxes(page) {
    return page.evaluate(() => {
        const box = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right };
        };
        const byLabel = (label) => box(document.querySelector(`[aria-label="${label}"]`));
        return {
            logo: box(document.querySelector('#af-header-logo')),
            party: byLabel('Open party'),
            signIn: byLabel('Sign in with Google'),
            refresh: byLabel('Refresh app'),
            theme: byLabel('Switch to dark mode') || byLabel('Switch to light mode'),
            account: byLabel('Open account'),
        };
    });
}

async function run(browserType, name, appUrl) {
    const browser = await browserType.launch({ headless: true });
    try {
        const tab = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await tab.addInitScript(`${OPFS_POLYFILL}
            const OriginalWorker = window.Worker;
            window.Worker = function Worker(url, opts) {
                const abs = new URL(String(url), location.href).href;
                const wrapper = new URL('/__opfs-worker.js', location.href);
                wrapper.searchParams.set('src', abs);
                return new OriginalWorker(wrapper.href, opts);
            };
            window.Worker.prototype = OriginalWorker.prototype;
        `);
        const tabPage = await tab.newPage();
        await onboard(tabPage, appUrl);
        await tabPage.locator('#af-header-logo').waitFor({ timeout: 20_000 });
        check(`${name} browser tab hides refresh`, (await tabPage.getByRole('button', { name: 'Refresh app' }).count()) === 0);
        await tab.close();

        const home = await browser.newContext({
            viewport: { width: 390, height: 844 },
            userAgent:
                name === 'webkit'
                    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
                    : undefined,
        });
        await home.addInitScript(`${OPFS_POLYFILL}
            try { Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }); } catch (e) {}
            const orig = window.matchMedia.bind(window);
            window.matchMedia = (query) => {
                const text = String(query);
                if (text.includes('display-mode: standalone') || text.includes('display-mode: fullscreen') || text.includes('display-mode: minimal-ui')) {
                    return { matches: true, media: text, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } };
                }
                return orig(query);
            };
            const OriginalWorker = window.Worker;
            window.Worker = function Worker(url, opts) {
                const abs = new URL(String(url), location.href).href;
                const wrapper = new URL('/__opfs-worker.js', location.href);
                wrapper.searchParams.set('src', abs);
                return new OriginalWorker(wrapper.href, opts);
            };
            window.Worker.prototype = OriginalWorker.prototype;
        `);
        const page = await home.newPage();
        await onboard(page, appUrl);
        const refresh = page.getByRole('button', { name: 'Refresh app' });
        check(`${name} home screen shows refresh`, (await refresh.count()) === 1);
        const boxes = await headerBoxes(page);
        const present = boxes.logo && boxes.refresh && boxes.signIn && boxes.theme && boxes.account && boxes.party;
        check(`${name} logo is on screen`, !!boxes.logo && boxes.logo.x >= 0 && boxes.logo.right <= 390, JSON.stringify(boxes.logo));
        check(`${name} refresh does not cover the logo`, present && !overlaps(boxes.logo, boxes.refresh), `logoRight=${boxes.logo?.right} refresh=${boxes.refresh?.x}`);
        check(`${name} sign-in does not cover the logo`, present && !overlaps(boxes.logo, boxes.signIn));
        check(`${name} theme does not cover the logo`, present && !overlaps(boxes.logo, boxes.theme));
        check(`${name} account does not cover the logo`, present && !overlaps(boxes.logo, boxes.account));
        check(`${name} party does not cover the logo`, present && !overlaps(boxes.logo, boxes.party));
        check(
            `${name} header icons stay inside 390px`,
            [boxes.party, boxes.signIn, boxes.refresh, boxes.theme, boxes.account].every((box) => box && box.x >= 0 && box.right <= 392),
            JSON.stringify(boxes)
        );

        if (name === 'chromium') {
            mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });
            await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/standalone-refresh-header-390.png', clip: { x: 0, y: 0, width: 390, height: 120 } });
        }

        if ((await refresh.count()) !== 1) {
            check(`${name} refresh click`, false, 'button missing');
            await home.close();
            return;
        }
        await page.evaluate(() => {
            const sw = navigator.serviceWorker;
            if (!sw) return;
            sw.getRegistration = async () => ({
                update: () =>
                    new Promise((resolve) => {
                        sessionStorage.setItem('af-sw-update', '1');
                        setTimeout(resolve, 350);
                    }),
                waiting: {
                    postMessage(value) {
                        sessionStorage.setItem('af-sw-message', JSON.stringify(value));
                    },
                },
            });
        });
        const reloaded = page.waitForEvent('load', { timeout: 15_000 }).catch((error) => error);
        await refresh.click();
        await page.getByRole('button', { name: 'Refreshing' }).waitFor({ timeout: 3000 }).catch(() => {});
        const spinning = await page.getByRole('button', { name: 'Refreshing' }).count();
        check(`${name} refresh shows a spinning state`, spinning === 1);
        await reloaded;
        await page.getByRole('button', { name: 'Refresh app' }).waitFor({ timeout: 20_000 });
        const saved = await page.evaluate(() => ({
            update: sessionStorage.getItem('af-sw-update'),
            message: sessionStorage.getItem('af-sw-message'),
        }));
        check(`${name} refresh checks for a service worker update`, saved.update === '1', JSON.stringify(saved));
        check(`${name} refresh asks the waiting worker to activate`, saved.message === '{"type":"SKIP_WAITING"}', saved.message || '');
        await home.close();
    } catch (error) {
        check(`${name} flow`, false, error?.message || String(error));
    } finally {
        await browser.close();
    }
}

async function main() {
    const server = await serveDist();
    const appUrl = `http://127.0.0.1:${server.address().port}/`;
    const types = [['chromium', chromium]];
    try {
        const probe = await webkit.launch({ headless: true });
        await probe.close();
        types.push(['webkit', webkit]);
    } catch (error) {
        console.log(`skip webkit (${error?.message || error})`);
    }
    try {
        for (const [name, type] of types) await run(type, name, appUrl);
    } finally {
        server.close();
    }
    if (failures) {
        console.error(`\n${failures} refresh check(s) failed`);
        process.exit(1);
    }
    console.log('\nstandalone refresh checks passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
