#!/usr/bin/env node
/**
 * Build web, serve dist, capture mobile (390x844) and desktop (1440x900) screenshots.
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

async function waitForServer(ms = 60000) {
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

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    });
}

async function seedAppState(page) {
    await page.addInitScript(() => {
        try {
            const stamp = JSON.stringify({ completedAt: Date.now() });
            localStorage.setItem('amplifood.onboarding.v1', stamp);
            localStorage.setItem('amplifood.legal.accepted', JSON.stringify({ version: '2026-10-09', acceptedAt: Date.now() }));
            localStorage.setItem('amplifood.dataConsent.v1', JSON.stringify({ anthropic: true, openai: true, xai: true, gemini: true, platform: true }));
            sessionStorage.setItem('af.splash', '1');
        } catch {}
    });
}

async function finishOnboardingIfVisible(page) {
    const agree = page.getByRole('button', { name: /I agree/i });
    if (!(await agree.isVisible().catch(() => false))) return;
    const toggle = page.getByRole('switch').first();
    if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
    }
    if (await agree.isEnabled().catch(() => false)) {
        await agree.click();
        await page.waitForTimeout(1200);
    }
}

async function capture() {
    await mkdir(outDir, { recursive: true });
    await run('npm', ['run', 'build:web']);

    const serve = spawn('npx', ['--yes', 'serve@14', 'dist', '--single', '--listen', String(port)], {
        cwd: root,
        stdio: 'ignore',
    });

    try {
        await waitForServer();
        const browser = await chromium.launch();

        const mobilePath = join(outDir, 'mobile-390x844-ampi.png');
        const desktopPath = join(outDir, 'desktop-1440x900-recipes.png');

        const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
        const mobilePage = await mobile.newPage();
        await seedAppState(mobilePage);
        await mobilePage.goto(base, { waitUntil: 'networkidle' });
        await finishOnboardingIfVisible(mobilePage);
        await mobilePage.waitForTimeout(4000);
        await mobilePage.screenshot({ path: mobilePath, fullPage: false });

        const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const desktopPage = await desktop.newPage();
        await seedAppState(desktopPage);
        await desktopPage.goto(`${base}/recipes`, { waitUntil: 'networkidle' });
        await finishOnboardingIfVisible(desktopPage);
        await desktopPage.waitForSelector('text=Recipes', { timeout: 60000 }).catch(() => {});
        await desktopPage.waitForTimeout(2000);
        await desktopPage.screenshot({ path: desktopPath, fullPage: false });

        await browser.close();
        console.log(JSON.stringify({ mobilePath, desktopPath }, null, 2));
    } finally {
        serve.kill('SIGTERM');
    }
}

capture().catch((err) => {
    console.error(err);
    process.exit(1);
});
