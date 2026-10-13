export const LIVE_PARTY_ID = '11111111-1111-4111-8111-111111111111';

async function onboard(page, appUrl) {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    try {
        const skip = page.getByLabel('Skip setup');
        await skip.waitFor({ timeout: 12_000 });
        await skip.click();
        await page.waitForTimeout(600);
        await page.locator('input[role=switch]').check({ force: true }).catch(() => {});
        await page.getByRole('button', { name: 'I agree' }).click({ timeout: 4000 }).catch(() => {});
    } catch {
        // Already past first-run setup (e.g. WebKit with persisted flags).
    }
    for (const t of ['Skip tour', 'Got it', 'Not now']) {
        await page.getByText(t, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
    }
}

export async function prepareLivePartyPage(page, appUrl, memberToken = 'member-token-alex') {
    await page.addInitScript(
        ({ token, liveId }) => {
            globalThis.__PARTY_SCREENSHOT_SEED__ = true;
            globalThis.__DESKTOP_SCREENSHOT_SEED__ = true;
            try {
                localStorage.setItem('amplifood.onboarding.v1', JSON.stringify({ completedAt: Date.now() }));
                localStorage.setItem(
                    'amplifood.legal.accepted',
                    JSON.stringify({ version: '2026-10-09', acceptedAt: Date.now() })
                );
                sessionStorage.setItem('af.splash', '1');
                localStorage.setItem('amplifood.party.privacyChipDismissed', '1');
                localStorage.setItem('amplifood.party.membersCollapsed', '1');
                localStorage.setItem(`amplifood.party.live.member.${liveId}`, token);
                localStorage.setItem(`amplifood.party.live.version.${liveId}`, '1');
                localStorage.setItem(`amplifood.party.live.chatSince.${liveId}`, '0');
                localStorage.setItem(
                    'amplifood.owner.session.v1',
                    JSON.stringify({
                        token: 't',
                        email: 'alex@example.com',
                        name: 'Alex Cook',
                        platformAiAllowed: true,
                        savedAt: Date.now(),
                    })
                );
                localStorage.setItem(
                    'amplifood.dataConsent.v1',
                    JSON.stringify({ platform: { grantedAt: Date.now() } })
                );
            } catch {
                // ignore
            }
        },
        { token: memberToken, liveId: LIVE_PARTY_ID }
    );

    await onboard(page, appUrl);
    await page.waitForTimeout(8000);

    await page.goto(new URL('party', appUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.waitForFunction(
        () => /Weekend BBQ|Game Night|Plan a party|Saturday Dinner/i.test(document.body?.innerText || ''),
        { timeout: 45_000 }
    );
    const bbq = page.getByText('Weekend BBQ', { exact: true });
    if (await bbq.count()) {
        await bbq.first().click({ timeout: 5000 });
        await page.waitForTimeout(800);
    }
}
