#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = join(import.meta.dirname, '..');
const outDir = process.env.SHOTS_DIR || '/opt/cursor/artifacts/screenshots';
const port = Number(process.env.PORT || 8771);
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

async function main() {
    await mkdir(outDir, { recursive: true });
    const server = spawn('npx', ['--yes', 'serve@14', 'dist', '--single', '--listen', String(port)], {
        cwd: root,
        stdio: 'pipe',
    });
    try {
        await waitForServer();
        const browser = await chromium.launch();
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
        await page.addInitScript(() => {
            try {
                localStorage.setItem('amplifood.onboarding.v1', JSON.stringify({ completedAt: Date.now() }));
                localStorage.setItem('amplifood.legal.accepted', JSON.stringify({ version: '2026-10-09', acceptedAt: Date.now() }));
                sessionStorage.setItem('af.splash', '1');
            } catch {}
        });
        await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.body?.innerText?.includes('Version'), { timeout: 60000 });
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(800);
        const path = join(outDir, 'account-version-footer-390.png');
        await page.screenshot({ path, fullPage: false });
        console.log('Wrote', path);
        await browser.close();
    } finally {
        server.kill('SIGTERM');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
