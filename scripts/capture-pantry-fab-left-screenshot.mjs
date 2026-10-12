#!/usr/bin/env node
/**
 * 390px Pantry with expanded item — floating add button on the bottom-left.
 * Run: npm run build:web && node scripts/capture-pantry-fab-left-screenshot.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.SHOTS_DIR || '/opt/cursor/artifacts/screenshots';

async function startServe() {
    const distDir = join(repoRoot, 'dist');
    if (!existsSync(join(distDir, 'index.html'))) {
        throw new Error('Run npm run build:web first');
    }
    return new Promise((resolve, reject) => {
        const child = spawn('npx', ['--yes', 'serve@14', 'dist', '--single', '--listen', '0'], {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const onData = (chunk) => {
            const m = String(chunk).match(/http:\/\/(?:127\.0\.0\.1|localhost):(\d+)/);
            if (m) resolve({ child, url: `http://127.0.0.1:${m[1]}/` });
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', reject);
        setTimeout(() => reject(new Error('serve timeout')), 30_000);
    });
}

async function onboard(page, appUrl) {
    await page.goto(appUrl);
    await page.getByLabel('Skip setup').click({ timeout: 45_000 });
    await page.waitForTimeout(600);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree' }).click({ timeout: 4000 }).catch(() => {});
}

async function main() {
    mkdirSync(outDir, { recursive: true });
    const { child, url } = await startServe();
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
        await page.addInitScript(() => {
            globalThis.__DESKTOP_SCREENSHOT_SEED__ = true;
        });
        await onboard(page, url);
        await page.waitForTimeout(4000);
        await page.goto(new URL('pantry', url).href, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        const expand = page.getByRole('button', { name: /^Expand / }).first();
        if (await expand.count()) {
            await expand.click();
            await page.waitForTimeout(1200);
        }
        const path = join(outDir, 'pantry-expanded-fab-left-390.png');
        await page.screenshot({ path, fullPage: false });
        console.log('Wrote', path);
        const addFab = page.getByRole('button', { name: 'Add pantry item' });
        const box = await addFab.boundingBox();
        if (!box || box.x > 120) {
            throw new Error(`Expected add FAB on the left; got x=${box?.x}`);
        }
    } finally {
        await browser.close();
        child.kill('SIGTERM');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
