#!/usr/bin/env node
import { chromium, webkit } from 'playwright';

const URL = process.env.APP_URL || 'https://amplifood.vercel.app';
const errors = [];

async function onboard(page) {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByLabel('Skip setup').click({ timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree', exact: true }).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    for (const t of ['Skip tour', 'Got it', 'Not now']) {
        await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
    }
    await page.waitForTimeout(1500);
}

async function tryGrocery(browserName, browserType) {
    const browser = await browserType.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        colorScheme: 'dark',
    });
    const page = await context.newPage();
    const consoleLogs = [];
    const pageErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleLogs.push(msg.text());
    });
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await onboard(page);
    const grocery = page.getByRole('tab', { name: /Grocery/i }).or(page.getByRole('link', { name: /Grocery/i }));
    await grocery.first().click({ timeout: 15_000 });
    await page.waitForTimeout(3000);
    const boundary = await page.getByText('Something went wrong').isVisible().catch(() => false);
    await browser.close();
    return { browserName, boundary, consoleLogs, pageErrors };
}

for (const [name, type] of [
    ['chromium', chromium],
    ['webkit', webkit],
]) {
    try {
        const r = await tryGrocery(name, type);
        console.log(JSON.stringify(r, null, 2));
    } catch (e) {
        console.log(name, 'FAIL', e.message);
    }
}
