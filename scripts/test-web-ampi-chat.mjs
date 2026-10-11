#!/usr/bin/env node
/**
 * Headless phone-width (390×844, touch) check of the Ampi chat:
 * - an iOS-style keyboard (simulated through window.visualViewport) pins the
 *   composer right above it, hides the tab bar, keeps the latest message in
 *   view and leaves no page scroll;
 * - replies render Markdown (no raw ** or audio tags, safe new-tab links),
 *   grouped bubbles, one disclaimer at the top, an AI label per reply and a
 *   typing bubble while waiting;
 * - "Listen" sends tagged, Markdown-free text to the owner ElevenLabs proxy;
 * - Account → Voice check reports each step and shows ElevenLabs' error.
 *
 * Requires: npm run build:web. Serves dist itself, or set APP_URL.
 * SHOTS_DIR=… saves screenshots.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const SHOTS = process.env.SHOTS_DIR || '';
const KEYBOARD_PX = 336;
const VIEW = { width: 390, height: 844 };

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
};

function serveDist() {
    if (!existsSync(join(distDir, 'index.html'))) throw new Error('dist/index.html missing; run npm run build:web first');
    const server = createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (pathname.startsWith('/api/')) {
            res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"not available in test"}');
            return;
        }
        let file = normalize(join(distDir, pathname));
        if (!file.startsWith(distDir)) return res.writeHead(403).end();
        if (!existsSync(file) || statSync(file).isDirectory()) file = join(distDir, 'index.html');
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function silentWav(seconds = 0.3, rate = 8000) {
    const samples = Math.round(seconds * rate);
    const buf = Buffer.alloc(44 + samples * 2);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + samples * 2, 4);
    buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(samples * 2, 40);
    return buf;
}

const REPLIES = [
    '[warmly] Happy to help! Here is a **quick dinner**:\n\n1. **Brown** the sausage.\n2. Add *crushed* tomatoes and broth.\n3. Simmer the noodles for 10 minutes.\n\nFull method: [Lasagna Soup](https://example.com/soup)',
    "[excited] Great choice! Use `2 cups` of broth and top with basil.",
    'Sure. Any **other** questions?',
];

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

let server;
let browser;
try {
    let appUrl = process.env.APP_URL;
    if (!appUrl) {
        server = await serveDist();
        appUrl = `http://127.0.0.1:${server.address().port}/`;
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIEW, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    // A stand-in for iOS Safari's visual viewport that the test can shrink and pan.
    await page.addInitScript(() => {
        const fake = new EventTarget();
        fake.height = window.innerHeight;
        fake.width = window.innerWidth;
        fake.offsetTop = 0;
        fake.offsetLeft = 0;
        fake.pageTop = 0;
        fake.scale = 1;
        Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
        window.__setKeyboard = (px, pan = 0) => {
            fake.height = window.innerHeight - px;
            fake.offsetTop = px ? pan : 0;
            fake.dispatchEvent(new Event('resize'));
            fake.dispatchEvent(new Event('scroll'));
            document.getElementById('__fake_kb')?.remove();
            if (px) {
                const kb = document.createElement('div');
                kb.id = '__fake_kb';
                kb.textContent = 'keyboard';
                Object.assign(kb.style, {
                    position: 'fixed', left: '0', right: '0', bottom: '0', height: `${px}px`, zIndex: '99999',
                    background: '#c9ccd3', color: '#6b6f78', font: '600 14px system-ui', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                });
                document.body.appendChild(kb);
            }
        };
    });

    const ttsRequests = [];
    let replyIndex = 0;
    let ttsFails = false;
    await page.route('**/api/auth/session', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ email: 'owner@example.com', name: 'Owner', sub: 's', platformAiAllowed: true, elevenlabsAvailable: true }),
        })
    );
    await page.route('**/api/ai/chat', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        if (body.mode === 'voices') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ voices: [{ voice_id: 'voice_abcdefgh', name: 'Rachel', preview_url: null, category: 'premade' }] }),
            });
        }
        if (body.mode === 'tts') {
            ttsRequests.push(body);
            if (ttsFails) {
                return route.fulfill({
                    status: 502,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'upstream_failed', message: 'Voice request failed. Try again later.', detail: 'HTTP 401: Quota exceeded.' }),
                });
            }
            return route.fulfill({ status: 200, headers: { 'content-type': 'audio/wav', 'x-elevenlabs-model': 'eleven_v3' }, body: silentWav() });
        }
        await new Promise((r) => setTimeout(r, 1500));
        const reply = REPLIES[replyIndex++ % REPLIES.length];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: JSON.stringify({ reply, actions: [] }), model: 'fake' }) });
    });

    const settle = (ms = 600) => page.waitForTimeout(ms);
    const shot = async (name) => {
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
    };
    const dismissTips = async () => {
        for (const t of ['Skip tour', 'Got it', 'Not now']) {
            await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
        }
    };
    const agreeConsent = async () => {
        for (const name of ['I agree', 'Allow', 'Agree']) {
            await page.getByRole('button', { name, exact: true }).click({ timeout: 600 }).catch(() => {});
        }
    };

    await page.goto(appUrl);
    const skip = page.getByLabel('Skip setup');
    await skip.waitFor({ timeout: 45_000 });
    await skip.click();
    await settle();
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree' }).click({ timeout: 4000 }).catch(() => {});
    await settle(1200);
    await dismissTips();
    await page.evaluate(() => {
        localStorage.setItem(
            'amplifood.owner.session.v1',
            JSON.stringify({ token: 't', email: 'owner@example.com', name: 'Owner', savedAt: Date.now() })
        );
        localStorage.setItem('amplifood.elevenlabs.platform.enabled', '1');
        localStorage.setItem('amplifood.elevenlabs.platform.voiceId', 'voice_abcdefgh');
        localStorage.setItem('amplifood.elevenlabs.platform.voiceName', 'Rachel');
    });
    await page.reload();
    await settle(3000);
    await dismissTips();

    const composer = page.getByLabel('Message to Ampi');
    const tabBar = page.locator('[role=tablist]');
    const composerBottom = () =>
        page.evaluate(() => {
            const el = document.querySelector('[aria-label="Message to Ampi"]');
            let wrap = el;
            for (let i = 0; i < 3 && wrap?.parentElement; i += 1) wrap = wrap.parentElement;
            return Math.round(wrap.getBoundingClientRect().bottom);
        });
    const sendMessage = async (text) => {
        await composer.fill(text);
        await page.getByLabel('Send', { exact: true }).click();
    };

    await composer.click();
    await settle(400);
    check('tab bar hides while the composer is focused', (await tabBar.count()) === 0);
    await page.evaluate((px) => window.__setKeyboard(px), KEYBOARD_PX);
    await settle(500);
    const keyboardTop = VIEW.height - KEYBOARD_PX;
    let bottom = await composerBottom();
    check('composer sits directly on the keyboard', Math.abs(bottom - keyboardTop) <= 2, `bottom ${bottom}, keyboard at ${keyboardTop}`);
    await shot('chat-1-keyboard-empty');

    await sendMessage('Plan a quick dinner');
    await settle(300);
    check('typing bubble shows while waiting', await page.getByLabel('Ampi is typing').isVisible());
    await shot('chat-2-typing');
    await agreeConsent();
    await page.getByText('quick dinner', { exact: true }).waitFor({ timeout: 15_000 });
    await settle(800);
    check('focus stays in the composer after sending', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Message to Ampi'));
    check('tab bar stays hidden after sending', (await tabBar.count()) === 0);

    await sendMessage('How much broth?');
    await page.getByText('2 cups', { exact: true }).waitFor({ timeout: 15_000 });
    await sendMessage('Thanks!');
    await page.getByText('other', { exact: true }).waitFor({ timeout: 15_000 });
    await settle(800);

    bottom = await composerBottom();
    check('composer still on the keyboard after replies', Math.abs(bottom - keyboardTop) <= 2, `bottom ${bottom}`);
    const latestVisible = await page.evaluate((limit) => {
        const nodes = [...document.querySelectorAll('div,span')].filter((el) => el.textContent?.trim() === 'Sure. Any other questions?');
        const el = nodes.at(-1);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.bottom <= limit && r.top >= 0;
    }, keyboardTop - 50);
    check('latest reply is scrolled into view above the composer', latestVisible);
    check('page itself never scrolls', await page.evaluate(() => (document.scrollingElement?.scrollTop || 0) === 0 && window.scrollY === 0));
    await shot('chat-3-keyboard-conversation');

    // iOS pans the visual viewport instead of resizing; the app follows the pan.
    await page.evaluate((px) => window.__setKeyboard(px, 120), KEYBOARD_PX);
    await settle(400);
    const rootTop = await page.evaluate(() => Math.round(document.getElementById('root').getBoundingClientRect().top));
    check('app follows a panned visual viewport', rootTop === 120, `root top ${rootTop}`);
    await page.evaluate((px) => window.__setKeyboard(px), KEYBOARD_PX);
    await settle(300);

    const bodyText = await page.locator('body').innerText();
    check('no raw Markdown asterisks in replies', !/\*\*/.test(bodyText));
    check('audio tags are hidden on screen', !/\[(warmly|excited)\]/.test(bodyText));
    check('numbered list rendered as a list', (await page.locator('[role=list]').count()) >= 1);
    const link = page.locator('a[href="https://example.com/soup"]');
    check('links open in a new tab with noopener', (await link.getAttribute('target')) === '_blank' && /noopener/.test((await link.getAttribute('rel')) || ''));
    const boldWeight = await page.getByText('Brown', { exact: true }).first().evaluate((el) => getComputedStyle(el).fontWeight);
    check('bold text is bold', Number(boldWeight) >= 600, `weight ${boldWeight}`);
    const disclaimers = await page.getByText('AI-generated and can be wrong', { exact: false }).count();
    check('long AI disclaimer appears once, at the top', disclaimers === 1, `${disclaimers} found`);
    const labels = await page.locator('[aria-label="AI-generated"]').count();
    check('every reply keeps its AI-generated label', labels >= 3, `${labels} labels`);

    // Blur: keyboard goes away, tab bar returns, #root is released.
    await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate(() => window.__setKeyboard(0));
    await settle(500);
    check('tab bar returns after the composer loses focus', (await tabBar.count()) === 1);
    check('root height restored', await page.evaluate(() => document.getElementById('root').style.height === ''));
    await shot('chat-4-conversation');

    // Read aloud through the owner ElevenLabs proxy.
    await page.getByLabel('Read this reply aloud').first().click();
    await settle(1500);
    const sent = ttsRequests[0]?.text || '';
    check('Listen sends text to ElevenLabs', ttsRequests.length >= 1);
    check('ElevenLabs text keeps audio tags', sent.includes('[warmly]'), sent.slice(0, 60));
    check('ElevenLabs text has no Markdown symbols', !/[*`]|\]\(/.test(sent), sent.slice(0, 80));
    check('no voice error shown', !(await page.getByText(/ElevenLabs voice failed|blocked the audio/).count()));

    // Account → Voice check.
    await page.locator('[aria-label="Open account"]').last().click();
    await settle(2000);
    const runCheck = page.getByText('Run voice check', { exact: true });
    await runCheck.scrollIntoViewIfNeeded();
    await runCheck.click();
    await page.getByText('Playback:', { exact: false }).waitFor({ timeout: 15_000 });
    await settle(500);
    const okSteps = await page.locator('text=/^(Signed in|Server session|Voice list|Speech audio|Playback): /').count();
    check('voice check runs every step', okSteps >= 5, `${okSteps} steps`);
    check('voice check reports the model', await page.getByText('from eleven_v3', { exact: false }).isVisible());
    await page.getByText('Voice check', { exact: true }).scrollIntoViewIfNeeded();
    await shot('chat-5-voice-check-ok');

    ttsFails = true;
    await runCheck.click();
    await page.getByText('Quota exceeded', { exact: false }).waitFor({ timeout: 15_000 });
    check('voice check shows the ElevenLabs error', await page.getByText('ElevenLabs said: HTTP 401: Quota exceeded.', { exact: false }).isVisible());
    await page.getByText('Voice check', { exact: true }).scrollIntoViewIfNeeded();
    await shot('chat-6-voice-check-error');

    check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (error) {
    failures += 1;
    console.error('FAIL', error.message.split('\n').slice(0, 3).join(' '));
    if (SHOTS && browser) {
        const [page] = browser.contexts()[0]?.pages() || [];
        await page?.screenshot({ path: join(SHOTS, 'chat-failure.png') }).catch(() => {});
    }
} finally {
    if (browser) await browser.close();
    if (server) server.close();
}

if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
}
console.log('\nAmpi chat works at phone width with the keyboard up');
