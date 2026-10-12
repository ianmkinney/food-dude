import { randomUUID } from 'node:crypto';
import { rowToChatMessage, sanitizePartyChatBody } from '../../api/_lib/partyChat.js';

export const LIVE_PARTY_ID = '11111111-1111-4111-8111-111111111111';

export function createSharedPartyMock() {
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

        if (action === 'chat_post' && route.request().method() === 'POST') {
            const body = route.request().postDataJSON() || {};
            const text = sanitizePartyChatBody(body.body);
            const row = {
                id: randomUUID(),
                party_id: LIVE_PARTY_ID,
                sender_member_id: members[memberToken]?.memberId || members['member-token-alex'].memberId,
                body: text,
                created_at: new Date().toISOString(),
                attachment_meta: null,
                is_ampi: Boolean(body.isAmpi),
            };
            messages.push(row);
            version += 1;
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, message: rowToChatMessage(row) }),
            });
        }

        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, parties: [] }),
        });
    };
}
