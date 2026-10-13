import { randomUUID } from 'node:crypto';
import {
    normalizeAttachmentMeta,
    partyChatPostRejection,
    rowToChatMessage,
    sanitizePartyChatBody,
} from '../../api/_lib/partyChat.js';

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

        if (action === 'changes_since' || action === 'chat_history' || url.pathname.endsWith('/party')) {
            if (action === 'chat_history') {
                const limit = Number(url.searchParams.get('limit') || 100);
                const beforeMs = Number(url.searchParams.get('beforeMs') || 0);
                const sorted = messages
                    .slice()
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                let batch = sorted;
                if (beforeMs > 0) {
                    batch = sorted.filter((m) => new Date(m.created_at).getTime() < beforeMs);
                }
                batch = batch.slice(-limit);
                const mapped = batch.map(rowToChatMessage);
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ok: true,
                        messages: mapped,
                        hasMore: beforeMs > 0 ? batch.length === limit : sorted.length > limit,
                        oldestCreatedAt: mapped[0]?.createdAt ?? null,
                        latestCreatedAt: mapped[mapped.length - 1]?.createdAt ?? 0,
                    }),
                });
            }
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
                body = route.request().postDataJSON() || {};
            } catch {
                body = {};
            }
            const postAction = body.action || action;
            if (postAction === 'refresh_owner_member_token') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, memberToken: 'member-token-alex' }),
                });
            }
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
                const attachment = normalizeAttachmentMeta(body.attachment);
                const rejection = partyChatPostRejection({
                    text,
                    isAmpi: Boolean(body.isAmpi),
                    attachment,
                });
                if (rejection) {
                    return route.fulfill({
                        status: 400,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'bad_request', message: rejection }),
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
                    created_at: new Date().toISOString(),
                    attachment_meta: attachment,
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
            if (postAction === 'claim_ingredient') {
                version += 1;
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ok: true,
                        version,
                        party: {
                            ...snapshot(),
                            ingredientClaims: [
                                {
                                    mealId: body.mealId,
                                    recipeId: body.recipeId,
                                    ingredientName: body.ingredientName,
                                    claimedByDisplayName: body.registerOnly
                                        ? null
                                        : body.claimedByMemberName || 'Alex Cook',
                                },
                            ],
                        },
                    }),
                });
            }
            if (postAction === 'set_pantry_share' || postAction === 'update_pantry_snapshot') {
                version += 1;
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, version, party: snapshot() }),
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
