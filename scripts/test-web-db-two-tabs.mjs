#!/usr/bin/env node
/**
 * Headless Chrome: two tabs should boot without "AmpliFood could not start".
 * Requires: npm run build:web && npx serve dist --listen 8765
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const PORT = 8765;
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
try {
    await waitForHttp();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await Promise.all([
        page1.goto(APP_URL, { waitUntil: 'domcontentloaded' }),
        page2.goto(APP_URL, { waitUntil: 'domcontentloaded' }),
    ]);
    await page1.waitForTimeout(8000);
    await page2.waitForTimeout(8000);

    const text1 = await page1.locator('body').innerText();
    const text2 = await page2.locator('body').innerText();
    if (/could not start/i.test(text1) || /could not start/i.test(text2)) {
        console.error('FAIL: startup error visible in one or both tabs');
        console.error('tab1:', text1.slice(0, 400));
        console.error('tab2:', text2.slice(0, 400));
        process.exitCode = 1;
    } else {
        console.log('ok two-tab web boot (no startup fatal)');
    }
} finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
}
