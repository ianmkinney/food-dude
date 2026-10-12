#!/usr/bin/env node
/**
 * Two browser contexts: A posts party chat; B polls and sees the message; A reload keeps history.
 * Requires: npm run build:web
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createSharedPartyMock } from './test-support/party-api-mock.mjs';
import { LIVE_PARTY_ID, prepareLivePartyPage } from './test-support/party-playwright-onboard.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function startServe() {
    const distDir = join(repoRoot, 'dist');
    if (!existsSync(join(distDir, 'index.html'))) {
        throw new Error('dist missing; run npm run build:web first');
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

async function openChat(page) {
    await page.getByText('Chat', { exact: true }).click();
    await page.getByPlaceholder(/Message the party/i).waitFor({ timeout: 20_000 });
}

async function main() {
    const { child: server, url: appUrl } = await startServe();
    const browser = await chromium.launch({ headless: true });
    const handler = createSharedPartyMock();
    let failed = false;

    try {
        const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await contextA.route('**/api/party*', handler);
        await contextB.route('**/api/party*', handler);

        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();

        await prepareLivePartyPage(pageA, appUrl, 'member-token-alex');
        await prepareLivePartyPage(pageB, appUrl, 'member-token-jordan');

        await openChat(pageA);
        const unique = `party-chat-${Date.now()}`;
        await pageA.getByPlaceholder(/Message the party/i).fill(`${unique} — see you Saturday!`);
        await pageA.getByLabel('Send').click();
        try {
            await pageA.getByText(unique, { exact: false }).waitFor({ timeout: 12_000 });
            console.log('ok context A shows sent message');
        } catch {
            console.error('FAIL: context A did not show message after send');
            failed = true;
        }

        await openChat(pageB);
        const deadline = Date.now() + 28_000;
        let seenOnB = false;
        while (Date.now() < deadline) {
            const text = await pageB.locator('body').innerText();
            if (text.includes(unique)) {
                seenOnB = true;
                break;
            }
            await pageB.waitForTimeout(1000);
        }
        if (!seenOnB) {
            console.error('FAIL: context B did not see message from A');
            failed = true;
        } else {
            console.log('ok two-context chat delivery');
        }

        await pageA.reload({ waitUntil: 'domcontentloaded' });
        await pageA.waitForTimeout(6000);
        await openChat(pageA);
        const afterReload = await pageA.locator('body').innerText();
        if (!afterReload.includes(unique)) {
            console.error('FAIL: message missing after reload in context A');
            failed = true;
        } else {
            console.log('ok chat survives reload');
        }

        await contextA.close();
        await contextB.close();
    } finally {
        await browser.close();
        server.kill('SIGTERM');
    }

    if (failed) process.exit(1);
    console.log('party chat playwright checks passed');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
