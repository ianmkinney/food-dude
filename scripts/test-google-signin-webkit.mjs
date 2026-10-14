#!/usr/bin/env node
/**
 * iPhone Safari sign-in: first tap must leave the app for Google and come back
 * signed in. Google and /api/auth/* are mocked; the static callback page is real.
 *
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=test-web-client.apps.googleusercontent.com npm run build:web
 *   npx playwright install webkit
 *   node scripts/test-google-signin-webkit.mjs
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const CLIENT_ID = 'test-web-client.apps.googleusercontent.com';
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
                    child = makeFile();
                    entries.set(name, child);
                }
                return child;
            },
            async removeEntry(name) { entries.delete(name); },
            async *[Symbol.asyncIterator]() {
                for (const pair of entries) yield pair;
            },
        };
    }
    function makeFile() {
        let bytes = new Uint8Array(0);
        return {
            kind: 'file',
            async createSyncAccessHandle() {
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
            },
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
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
};

function serveDist() {
    if (!existsSync(join(distDir, 'index.html'))) throw new Error('dist missing; run npm run build:web');
    if (!walkHasClientId(distDir)) {
        throw new Error(
            `Web bundle was built without ${CLIENT_ID}. Rebuild with EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${CLIENT_ID}`
        );
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
            res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"unmocked"}');
            return;
        }
        let file = pathname === '/auth/google-callback' ? join(distDir, 'auth/google-callback.html') : normalize(join(distDir, pathname));
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

function walkHasClientId(dir, depth = 0) {
    if (depth > 6) return false;
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (walkHasClientId(full, depth + 1)) return true;
            continue;
        }
        if (!name.endsWith('.js')) continue;
        if (readFileSync(full, 'utf8').includes(CLIENT_ID)) return true;
    }
    return false;
}

let server;
let browser;
try {
    server = await serveDist();
    const appUrl = `http://127.0.0.1:${server.address().port}/`;
    browser = await webkit.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA,
    });
    await context.addInitScript(() => {
        localStorage.setItem('amplifood.onboarding.v1', JSON.stringify({ completedAt: Date.now() }));
        localStorage.setItem('amplifood.legal.accepted', JSON.stringify({ version: '2026-10-09', acceptedAt: Date.now() }));
        localStorage.setItem('amplifood.dataConsent.v1', JSON.stringify({ platform: { grantedAt: Date.now() } }));
        sessionStorage.setItem('af.splash', '1');

        // Playwright WebKit has no OPFS. A same-origin wrapper keeps wasm URLs valid.
        const OriginalWorker = window.Worker;
        window.Worker = function Worker(url, opts) {
            const abs = new URL(String(url), location.href).href;
            const wrapper = new URL('/__opfs-worker.js', location.href);
            wrapper.searchParams.set('src', abs);
            return new OriginalWorker(wrapper.href, opts);
        };
        window.Worker.prototype = OriginalWorker.prototype;
    });
    const page = await context.newPage();
    const urls = [];
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) urls.push(frame.url());
    });
    let authRequest = null;
    let posted = null;
    await page.route('https://accounts.google.com/o/oauth2/v2/auth**', async (route) => {
        const reqUrl = new URL(route.request().url());
        authRequest = reqUrl;
        const state = reqUrl.searchParams.get('state') || '';
        const redirectUri = reqUrl.searchParams.get('redirect_uri') || '';
        const hash = new URLSearchParams({ id_token: 'playwright-id-token', state });
        const next = `${redirectUri}#${hash.toString()}`;
        await route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: `<!doctype html><meta charset="utf-8"><title>Google</title><script>location.replace(${JSON.stringify(next)});</script>`,
        });
    });
    await page.route('**/api/**', async (route) => {
        const url = route.request().url();
        const method = route.request().method();
        if (url.includes('/api/auth/google') && method === 'POST') {
            posted = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    token: 'sess-test',
                    email: 'ian@example.com',
                    name: 'Ian',
                    picture: '',
                    sub: 'sub-1',
                    platformAiAllowed: false,
                }),
            });
            return;
        }
        if (url.includes('/api/auth/session') && method === 'GET') {
            const auth = route.request().headers().authorization || '';
            if (auth !== 'Bearer sess-test') {
                await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    email: 'ian@example.com',
                    name: 'Ian',
                    picture: '',
                    sub: 'sub-1',
                    platformAiAllowed: false,
                    elevenlabsAvailable: false,
                }),
            });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const signIn = page.getByLabel('Sign in with Google').first();
    try {
        await signIn.click({ timeout: 20_000 });
    } catch (error) {
        const text = await page.locator('body').innerText().catch(() => '');
        console.log('PAGE TEXT', text.slice(0, 1500));
        throw error;
    }

    try {
        await page.getByLabel('Open account and sync').waitFor({ timeout: 25_000 });
    } catch (error) {
        const text = await page.locator('body').innerText().catch(() => '');
        console.log('PAGE', page.url(), text.slice(0, 800));
        throw error;
    }
    if (!authRequest) throw new Error('Sign in did not navigate to Google');
    if (authRequest.searchParams.get('response_type') !== 'id_token') {
        throw new Error(`expected response_type=id_token, got ${authRequest.searchParams.get('response_type')}`);
    }
    const redirectUri = authRequest.searchParams.get('redirect_uri') || '';
    if (!redirectUri.endsWith('/auth/google-callback')) throw new Error(`bad redirect_uri ${redirectUri}`);
    if (!urls.some((url) => url.includes('/auth/google-callback'))) {
        throw new Error(`callback page did not load (${urls.join(' | ')})`);
    }
    if (!posted?.idToken || !posted?.nonce) throw new Error(`auth exchange missing token/nonce ${JSON.stringify(posted)}`);
    if (posted.nonce !== authRequest.searchParams.get('nonce')) {
        throw new Error('posted nonce did not match the Google request nonce');
    }
    if (posted.idToken !== 'playwright-id-token') throw new Error('posted id token was not the callback token');

    await page.goto(new URL('account', appUrl).href, { waitUntil: 'domcontentloaded' });
    await page.getByText('Signed in as Ian').waitFor({ timeout: 20_000 });
    console.log('ok iPhone Safari same-tab Google sign-in');
} finally {
    await Promise.race([browser?.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))]);
    server?.close();
}
process.exit(0);
