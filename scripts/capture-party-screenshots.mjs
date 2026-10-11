#!/usr/bin/env node
/**
 * Build web, serve dist with SPA fallback, seed party data, capture 390px screenshots.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const outDir = process.env.SHOTS_DIR || '/opt/cursor/artifacts/screenshots';

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd: repoRoot, stdio: 'inherit', ...opts });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    });
}

async function startServe() {
    if (!existsSync(join(distDir, 'index.html'))) {
        throw new Error('dist missing; run npm run build:web first');
    }
    return new Promise((resolve, reject) => {
        const child = spawn('npx', ['--yes', 'serve@14', 'dist', '--single', '--listen', '0'], {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let port;
        const onData = (chunk) => {
            const m = String(chunk).match(/http:\/\/(?:127\.0\.0\.1|localhost):(\d+)/);
            if (m && !port) {
                port = m[1];
                resolve({ child, url: `http://127.0.0.1:${port}/` });
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', reject);
        setTimeout(() => reject(new Error('serve did not start in time')), 30_000);
    });
}

const dismissTips = async (page) => {
    for (const t of ['Skip tour', 'Got it', 'Not now']) {
        await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
    }
};

async function preparePartyPage(page, appUrl, themeMode) {
    await page.addInitScript((mode) => {
        globalThis.__PARTY_SCREENSHOT_SEED__ = true;
        try {
            localStorage.setItem('themeMode', mode);
            localStorage.setItem('amplifood.party.privacyChipDismissed', '1');
            localStorage.setItem('amplifood.party.membersCollapsed', '1');
        } catch {
            // ignore
        }
    }, themeMode);

    await page.goto(appUrl);
    const skip = page.getByLabel('Skip setup');
    await skip.waitFor({ timeout: 45_000 });
    await skip.click();
    await page.waitForTimeout(800);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree' }).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await dismissTips(page);

    await page.evaluate(() =>
        localStorage.setItem(
            'amplifood.owner.session.v1',
            JSON.stringify({ token: 't', email: 'owner@example.com', name: 'Owner', savedAt: Date.now() })
        )
    );
    await page.reload();
    await page.waitForTimeout(2500);
    await dismissTips(page);

    await page.goto(new URL('party', appUrl).href);
    await page.waitForTimeout(2000);
    await page.getByText('Weekend BBQ', { exact: true }).first().waitFor({ timeout: 20_000 });
    await page.getByText('Saturday Dinner', { exact: true }).first().waitFor({ timeout: 15_000 });
};

async function main() {
    mkdirSync(outDir, { recursive: true });
    if (!existsSync(join(distDir, 'index.html')) || process.env.FORCE_BUILD === '1') {
        console.log('Building web…');
        await run('npm', ['run', 'build:web']);
    }

    const { child: server, url } = await startServe();
    const browser = await chromium.launch({ headless: true });

    try {
        for (const theme of ['light', 'dark']) {
            const context = await browser.newContext({
                viewport: { width: 390, height: 844 },
                colorScheme: theme,
            });
            const page = await context.newPage();

            await preparePartyPage(page, url, theme);

            const collapsedPath = join(outDir, `party-screen-390-${theme}-collapsed.png`);
            await page.screenshot({ path: collapsedPath, fullPage: true });
            console.log('Wrote', collapsedPath);

            await page.getByText(/\d+ members/).first().click();
            await page.waitForTimeout(600);
            await page.getByText('Jordan Lee', { exact: true }).waitFor({ timeout: 8000 });

            const expandedPath = join(outDir, `party-screen-390-${theme}-expanded.png`);
            await page.screenshot({ path: expandedPath, fullPage: true });
            console.log('Wrote', expandedPath);

            await context.close();
        }

        const detailContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
            colorScheme: 'light',
        });
        const detailPage = await detailContext.newPage();
        await preparePartyPage(detailPage, url, 'light');
        await detailPage.getByText('Saturday Dinner', { exact: true }).first().click();
        await detailPage.waitForTimeout(1500);
        await detailPage.getByText(/claimed|Claimed/i).first().waitFor({ timeout: 10_000 }).catch(() => {});
        const mealDetailPath = join(outDir, 'party-meal-detail-390-light.png');
        await detailPage.screenshot({ path: mealDetailPath, fullPage: true });
        console.log('Wrote', mealDetailPath);
        await detailContext.close();
    } finally {
        await browser.close();
        server.kill('SIGTERM');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
