#!/usr/bin/env node
/**
 * Two browser contexts: backup sync (recipe) + party live poll (meal) without reload.
 * Requires: npm run build:web
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createMemoryBackupSyncServer } from './lib/memoryBackupSync.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');

process.env.SESSION_SECRET = 'e2e-sync-secret';
process.env.ALLOWED_EMAILS = 'owner@example.com';
const { signSession } = await import('../api/_lib/session.js');
const ownerToken = await signSession({ sub: 'e2e-sub', email: 'owner@example.com', name: 'Owner' });

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
};

const backupSync = createMemoryBackupSyncServer();
const LIVE_PARTY_ID = 'e2e-live-party';
let partyVersion = 1;
let partyMeals = [
    {
        id: 'meal-e2e-1',
        name: 'E2E Meal',
        description: 'Cross-tab',
        recipeIds: [],
        recipeMeta: {},
    },
];

function serveDist() {
    const server = createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const pathname = decodeURIComponent(url.pathname);

        if (pathname.startsWith('/api/backup')) {
            const action = url.searchParams.get('action') || '';
            let body = {};
            if (req.method === 'POST') {
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                try {
                    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                } catch {
                    body = {};
                }
            }
            const auth = req.headers.authorization || '';
            if (!auth.includes(ownerToken)) {
                res.writeHead(401).end(JSON.stringify({ error: 'unauthorized' }));
                return;
            }
            if (action === 'sync-push') {
                res.writeHead(200).end(JSON.stringify(backupSync.handleSyncPush(body)));
                return;
            }
            if (action === 'sync-pull') {
                res.writeHead(200).end(JSON.stringify(backupSync.handleSyncPull(body)));
                return;
            }
            if (action === 'sync-status') {
                res.writeHead(200).end(JSON.stringify({ ok: true, recordCount: backupSync.records.size }));
                return;
            }
            res.writeHead(404).end('{}');
            return;
        }

        if (pathname.startsWith('/api/party')) {
            const action = url.searchParams.get('action') || '';
            if (action === 'changes_since') {
                const since = Number(url.searchParams.get('sinceVersion') || 0);
                const changed = partyVersion > since;
                res.writeHead(200).end(
                    JSON.stringify({
                        changed,
                        version: partyVersion,
                        party: changed
                            ? {
                                  id: LIVE_PARTY_ID,
                                  name: 'E2E Party',
                                  version: partyVersion,
                                  meals: partyMeals,
                                  members: [],
                                  ingredientClaims: [],
                              }
                            : undefined,
                    })
                );
                return;
            }
            if (action === 'get') {
                res.writeHead(200).end(
                    JSON.stringify({
                        party: {
                            id: LIVE_PARTY_ID,
                            name: 'E2E Party',
                            version: partyVersion,
                            meals: partyMeals,
                            members: [],
                            ingredientClaims: [],
                        },
                    })
                );
                return;
            }
            if (pathname === '/api/party' && req.method === 'POST') {
                let body = {};
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                try {
                    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                } catch {
                    body = {};
                }
                if (body.action === 'update_meals' || url.searchParams.get('action') === 'update_meals') {
                    if (Array.isArray(body.meals)) {
                        partyMeals = body.meals;
                        partyVersion += 1;
                    }
                    res.writeHead(200).end(JSON.stringify({ ok: true, version: partyVersion }));
                    return;
                }
            }
            res.writeHead(200).end(JSON.stringify({ error: 'misconfigured' }));
            return;
        }

        if (pathname.startsWith('/api/auth/session')) {
            res.writeHead(200).end(
                JSON.stringify({ email: 'owner@example.com', name: 'Owner', platformAiAllowed: true })
            );
            return;
        }

        let file = join(distDir, pathname === '/' ? 'index.html' : pathname);
        if (!existsSync(file) || statSync(file).isDirectory()) {
            file = join(distDir, 'index.html');
        }
        res.writeHead(200, { 'Content-Type': MIME[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream' });
        createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

if (!existsSync(join(distDir, 'index.html'))) {
    console.error('dist missing — run npm run build:web');
    process.exit(1);
}

const server = await serveDist();
const appUrl = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true });

const boot = {
    token: ownerToken,
    syncMs: 2000,
};

async function seedPage(page) {
    await page.addInitScript((cfg) => {
        window.__CROSS_TAB_SYNC_TEST__ = true;
        window.__AMPLIFOOD_SYNC_VISIBLE_MS__ = cfg.syncMs;
        localStorage.setItem(
            'amplifood.owner.session.v1',
            JSON.stringify({
                token: cfg.token,
                email: 'owner@example.com',
                name: 'Owner',
                savedAt: Date.now(),
            })
        );
        localStorage.setItem('amplifood.sync.enabled.v1', '1');
        localStorage.setItem(
            'amplifood.dataConsent.v1',
            JSON.stringify({ platform: { grantedAt: Date.now() } })
        );
    }, boot);
}

try {
    const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await seedPage(pageA);
    await seedPage(pageB);

    await Promise.all([
        pageA.goto(appUrl, { waitUntil: 'domcontentloaded' }),
        pageB.goto(appUrl, { waitUntil: 'domcontentloaded' }),
    ]);
    const bootstrap = async (page) => {
        await page.getByLabel('Skip setup').click({ timeout: 45_000 }).catch(() => {});
        await page.waitForTimeout(1200);
        await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
        await page.getByRole('button', { name: 'I agree', exact: true }).click({ timeout: 8000 }).catch(() => {});
        for (const t of ['Skip tour', 'Got it', 'Not now']) {
            await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
        }
        await page.waitForTimeout(1500);
    };
    await bootstrap(pageA);
    await bootstrap(pageB);

    await pageB.getByRole('link', { name: 'Recipes' }).click();
    await pageB.waitForTimeout(800);

    await pageA.evaluate(async () => {
        if (typeof globalThis.__amplifoodE2eCreateRecipe !== 'function') {
            throw new Error('e2e recipe helper missing');
        }
        await globalThis.__amplifoodE2eCreateRecipe('Sync Tab A Recipe');
    });
    console.log('server sync records after tab A push:', backupSync.records.size);
    await pageA.waitForTimeout(1500);
    await pageB.bringToFront();
    const syncResult = await pageB.evaluate(async () => globalThis.__amplifoodE2eRunSync?.());
    console.log('tab B manual sync:', syncResult);
    await pageB.waitForTimeout(3500);

    const deadline = Date.now() + 25_000;
    let sawRecipe = false;
    while (Date.now() < deadline) {
        const titles = await pageB.evaluate(async () =>
            typeof globalThis.__amplifoodE2eRecipeTitles === 'function'
                ? globalThis.__amplifoodE2eRecipeTitles()
                : []
        );
        if (titles.includes('Sync Tab A Recipe')) {
            sawRecipe = true;
            break;
        }
        await pageB.waitForTimeout(1500);
    }
    check('tab B SQLite has recipe after cloud pull (no reload)', sawRecipe);

    await pageB.getByRole('link', { name: 'Parties' }).click();
    await pageB.waitForTimeout(1200);

    partyMeals = [
        {
            id: 'meal-e2e-1',
            name: 'E2E Meal',
            description: 'Now with pie',
            recipeIds: [999],
            recipeMeta: {},
        },
    ];
    partyVersion += 1;

    await pageA.evaluate(
        async ({ partyId, token }) => {
            await fetch(`/api/party?action=update_meals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    'X-Party-Member-Token': 'e2e-member-token',
                },
                body: JSON.stringify({
                    action: 'update_meals',
                    partyId,
                    meals: [
                        {
                            id: 'meal-e2e-1',
                            name: 'E2E Meal',
                            description: 'Now with pie',
                            recipeIds: [999],
                            recipeMeta: {},
                        },
                    ],
                }),
            });
        },
        { partyId: LIVE_PARTY_ID, token: ownerToken }
    );

    const partyDeadline = Date.now() + 20_000;
    let sawParty = false;
    while (Date.now() < partyDeadline) {
        const text = await pageB.locator('body').innerText();
        if (text.includes('Now with pie')) {
            sawParty = true;
            break;
        }
        await pageB.waitForTimeout(1200);
    }
    check('tab B party screen refreshes after live meal change', sawParty);
} catch (e) {
    console.error(e);
    failures += 1;
} finally {
    await browser.close();
    server.close();
}

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('cross-tab cloud sync checks passed');
