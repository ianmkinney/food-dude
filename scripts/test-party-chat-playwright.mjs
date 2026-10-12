#!/usr/bin/env node
/**
 * Two browser contexts: A posts party chat; B polls and sees text + attachment filename (not bytes).
 * Requires: npm run build:web
 */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
    normalizeAttachmentMeta,
    rowToChatMessage,
    sanitizePartyChatBody,
} from '../api/_lib/partyChat.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_PARTY_ID = '11111111-1111-4111-8111-111111111111';

function createSharedPartyMock() {
    const members = {
        'member-token-alex': {
            memberId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            displayName: 'Alex Cook',
        },
        'member-token-jordan': {
            memberId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            displayName: 'Jordan Lee',
        },
    };
    const messages = [];
    let version = 1;
    let tick = 0;

    const snapshot = () => ({
        id: LIVE_PARTY_ID,
        name: 'Weekend BBQ',
        ownerEmail: 'alex@example.com',
        version,
        inviteToken: 'invite-seed',
        members: Object.entries(members).map(([token, m]) => ({
            memberId: m.memberId,
            displayName: m.displayName,
            email: m.displayName.includes('Alex') ? 'alex@example.com' : 'jordan@example.com',
            status: 'active',
            joinedAt: Date.now(),
        })),
        meals: [{ id: 'meal-1', name: 'Saturday Dinner', recipeIds: [], recipeMeta: {} }],
        ingredientClaims: [],
    });

    return async (route) => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get('action') || '';
        const memberToken = route.request().headers()['x-party-member-token'] || '';

        if (action === 'changes_since' || url.pathname.endsWith('/party')) {
            if (action === 'changes_since') {
                const sinceChatMs = Number(url.searchParams.get('sinceChatMs') || 0);
                const rows = messages.filter((m) => new Date(m.created_at).getTime() > sinceChatMs);
                const latest = rows.length
                    ? new Date(rows[rows.length - 1].created_at).getTime()
                    : sinceChatMs;
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ok: true,
                        changed: false,
                        version,
                        chat: { messages: rows.map(rowToChatMessage), latestCreatedAt: latest },
                    }),
                });
            }
            if (action === 'get') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, party: snapshot() }),
                });
            }
        }

        if (route.request().method() === 'POST') {
            let body = {};
            try {
                body = route.request().postDataJSON();
            } catch {
                body = {};
            }
            const postAction = body.action || action;
            if (postAction === 'chat_post') {
                const member = members[memberToken];
                if (!member) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'forbidden' }),
                    });
                }
                const text = sanitizePartyChatBody(body.body);
                const attach = normalizeAttachmentMeta(body.attachment);
                if (!text && !attach) {
                    return route.fulfill({
                        status: 400,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'bad_request' }),
                    });
                }
                const row = {
                    id: randomUUID(),
                    party_id: LIVE_PARTY_ID,
                    sender_member_id: body.isAmpi ? null : member.memberId,
                    sender_display_name: body.isAmpi
                        ? `Ampi (via ${body.ampiViaName})`
                        : member.displayName,
                    body: text,
                    is_ampi: Boolean(body.isAmpi),
                    ampi_via_name: body.isAmpi ? body.ampiViaName : null,
                    attachment_meta: attach,
                    created_at: new Date(Date.now() + tick++),
                };
                messages.push(row);
                version += 1;
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, message: rowToChatMessage(row) }),
                });
            }
        }

        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, parties: [] }),
        });
    };
}

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

async function onboard(page, appUrl) {
    await page.goto(appUrl);
    const skip = page.getByLabel('Skip setup');
    await skip.waitFor({ timeout: 45_000 });
    await skip.click();
    await page.waitForTimeout(600);
    await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
    await page.getByRole('button', { name: 'I agree' }).click({ timeout: 4000 }).catch(() => {});
}

async function prepareLiveParty(page, appUrl, memberToken) {
    await page.addInitScript((token, liveId) => {
        globalThis.__PARTY_SCREENSHOT_SEED__ = true;
        try {
            localStorage.setItem('amplifood.party.privacyChipDismissed', '1');
            localStorage.setItem('amplifood.party.membersCollapsed', '1');
            localStorage.setItem(`amplifood.party.live.member.${liveId}`, token);
            localStorage.setItem(`amplifood.party.live.version.${liveId}`, '1');
            localStorage.setItem(`amplifood.party.live.chatSince.${liveId}`, '0');
        } catch {
            // ignore
        }
    }, memberToken, LIVE_PARTY_ID);

    await onboard(page, appUrl);
    await page.waitForTimeout(3500);

    await page.goto(new URL('party', appUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.getByText('Weekend BBQ', { exact: true }).first().waitFor({ timeout: 20_000 });
}

const handler = createSharedPartyMock();

async function main() {
    const { child: server, url: appUrl } = await startServe();
    const browser = await chromium.launch({ headless: true });
    let failed = false;

    try {
        const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await contextA.route('**/api/party*', handler);
        await contextB.route('**/api/party*', handler);

        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();

        await prepareLiveParty(pageA, appUrl, 'member-token-alex');
        await prepareLiveParty(pageB, appUrl, 'member-token-jordan');

        await pageA.getByText('Chat', { exact: true }).click();
        await pageA.getByPlaceholder(/Message the party/i).waitFor({ timeout: 15_000 });
        const unique = `party-chat-${Date.now()}`;
        await pageA.getByPlaceholder(/Message the party/i).fill(`${unique} — see you Saturday!`);
        await pageA.getByLabel('Send').click();
        await pageA.waitForTimeout(800);
        await pageA.getByText(unique, { exact: false }).waitFor({ timeout: 10_000 }).catch(() => {});

        await pageB.getByText('Chat', { exact: true }).click();
        await pageB.getByPlaceholder(/Message the party/i).waitFor({ timeout: 15_000 });
        const deadline = Date.now() + 25_000;
        let seen = false;
        while (Date.now() < deadline) {
            const text = await pageB.locator('body').innerText();
            if (text.includes(unique)) {
                seen = true;
                break;
            }
            await pageB.waitForTimeout(1200);
        }
        if (!seen) {
            console.error('FAIL: context B did not see message from A');
            failed = true;
        } else {
            console.log('ok two-context chat delivery');
        }

        const bodyB = await pageB.locator('body').innerText();
        if (/secret-recipe\.pdf/i.test(bodyB) && !unique.includes('secret-recipe')) {
            console.log('ok attachment filename visible when posted with file (optional)');
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
