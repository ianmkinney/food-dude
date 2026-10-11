#!/usr/bin/env node
/**
 * Build web, seed sample data via UI, capture mobile + desktop screenshots.
 * SHOTS_DIR defaults to /opt/cursor/artifacts/screenshots
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = join(import.meta.dirname, '..');
const outDir = process.env.SHOTS_DIR || '/opt/cursor/artifacts/screenshots';
const port = Number(process.env.PORT || 8765);
const base = `http://127.0.0.1:${port}`;

async function waitForServer(ms = 90000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        try {
            const res = await fetch(base);
            if (res.ok) return;
        } catch {
            // retry
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error('Server did not start');
}

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    });
}

async function seedAppState(page) {
    await page.addInitScript(() => {
        try {
            const stamp = JSON.stringify({ completedAt: Date.now() });
            localStorage.setItem('amplifood.onboarding.v1', stamp);
            localStorage.setItem('amplifood.legal.accepted', JSON.stringify({ version: '2026-10-09', acceptedAt: Date.now() }));
            localStorage.setItem(
                'amplifood.dataConsent.v1',
                JSON.stringify({
                    anthropic: { grantedAt: Date.now() },
                    openai: { grantedAt: Date.now() },
                    xai: { grantedAt: Date.now() },
                    gemini: { grantedAt: Date.now() },
                    platform: { grantedAt: Date.now() },
                })
            );
            sessionStorage.setItem('af.splash', '1');
            window.__DESKTOP_SCREENSHOT_SEED__ = true;
        } catch {}
    });
}

async function finishOnboardingIfVisible(page) {
    const agree = page.getByRole('button', { name: /I agree/i });
    if (!(await agree.isVisible().catch(() => false))) return;
    const toggle = page.getByRole('switch').first();
    if (await toggle.isVisible().catch(() => false)) await toggle.click();
    if (await agree.isEnabled().catch(() => false)) {
        await agree.click();
        await page.waitForTimeout(1500);
    }
}

async function waitForAppReady(page) {
    await page.waitForFunction(
        () => document.body?.innerText?.includes('AmpliFood') || document.body?.innerText?.includes('Ampi'),
        { timeout: 60000 }
    );
    await page.waitForTimeout(2000);
}

async function seedSampleData(page) {
    await page.goto(base, { waitUntil: 'networkidle' });
    await finishOnboardingIfVisible(page);
    await waitForAppReady(page);
    await page.waitForTimeout(2500);
}

async function shot(page, file) {
    const path = join(outDir, file);
    await page.screenshot({ path, fullPage: false });
    return path;
}

async function capture() {
    await mkdir(outDir, { recursive: true });
    await run('npm', ['run', 'build:web']);

    const serve = spawn('npx', ['--yes', 'serve@14', 'dist', '--single', '--listen', String(port)], {
        cwd: root,
        stdio: 'ignore',
    });

    const paths = {};

    try {
        await waitForServer();
        const browser = await chromium.launch();

        const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
        const mobilePage = await mobileCtx.newPage();
        await seedAppState(mobilePage);
        await mobilePage.goto(base, { waitUntil: 'networkidle' });
        await finishOnboardingIfVisible(mobilePage);
        await waitForAppReady(mobilePage);
        paths.mobileAmpi = await shot(mobilePage, 'mobile-390x844-ampi.png');

        const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const desktop = await desktopCtx.newPage();
        await seedAppState(desktop);
        await desktop.goto(base, { waitUntil: 'networkidle' });
        await finishOnboardingIfVisible(desktop);
        await waitForAppReady(desktop);
        await seedSampleData(desktop);

        const shots = [
            ['desktop-1440x900-ampi.png', base],
            ['desktop-1440x900-recipes.png', `${base}/recipes`],
            ['desktop-1440x900-planner.png', `${base}/planner`],
            ['desktop-1440x900-grocery.png', `${base}/grocery`],
            ['desktop-1440x900-pantry.png', `${base}/pantry`],
            ['desktop-1440x900-parties.png', `${base}/party`],
            ['desktop-1440x900-account.png', `${base}/account`],
        ];

        for (const [file, url] of shots) {
            await desktop.goto(url, { waitUntil: 'networkidle' });
            await waitForAppReady(desktop);
            await desktop.waitForTimeout(1500);
            paths[file.replace('.png', '')] = await shot(desktop, file);
        }

        await desktop.goto(`${base}/recipes`, { waitUntil: 'networkidle' });
        await waitForAppReady(desktop);
        await desktop.waitForTimeout(2000);
        const recipeCard = desktop.getByText('Weeknight Tomato Pasta', { exact: true });
        await recipeCard.waitFor({ state: 'visible', timeout: 20000 });
        await recipeCard.click();
        await desktop.waitForURL(/\/recipe\/\d+/, { timeout: 20000 });
        await desktop.waitForFunction(
            () =>
                document.body?.innerText?.includes('Weeknight Tomato Pasta') &&
                document.body?.innerText?.includes('Ingredients'),
            { timeout: 20000 }
        );
        await desktop.waitForTimeout(1000);
        paths.desktopRecipeDetail = await shot(desktop, 'desktop-1440x900-recipe-detail.png');

        await browser.close();
        console.log(JSON.stringify(paths, null, 2));
    } finally {
        serve.kill('SIGTERM');
    }
}

capture().catch((err) => {
    console.error(err);
    process.exit(1);
});
