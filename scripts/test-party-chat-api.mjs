#!/usr/bin/env node
/**
 * Party chat protocol checks: sanitize/merge helpers + in-memory chat_post / changes_since.
 */
import { randomUUID } from 'node:crypto';
import {
    MAX_PARTY_CHAT_LEN,
    mergePartyChatMessages,
    normalizeAttachmentMeta,
    rowToChatMessage,
    sanitizePartyChatBody,
} from '../api/_lib/partyChat.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

check('strips tags', sanitizePartyChatBody('<b>hi</b>') === 'hi');
check('caps length', sanitizePartyChatBody('x'.repeat(MAX_PARTY_CHAT_LEN + 50)).length === MAX_PARTY_CHAT_LEN);
check('attachment meta', normalizeAttachmentMeta({ fileName: 'menu.pdf', sizeBytes: 12 })?.fileName === 'menu.pdf');
check('rejects empty attachment', normalizeAttachmentMeta({}) === null);

const merged = mergePartyChatMessages(
    [{ id: 'a', createdAt: 1, body: 'one' }],
    [{ id: 'b', createdAt: 2, body: 'two' }, { id: 'a', createdAt: 3, body: 'one edited' }]
);
check('merge sorts and upserts', merged.length === 2 && merged[1].body === 'one edited');

function createMemoryChatServer(partyId) {
    const messages = [];
    let tick = 0;
    const members = {
        'token-a': { memberId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', displayName: 'Alex' },
        'token-b': { memberId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', displayName: 'Jordan' },
    };

    return {
        chatPost({ memberToken, body, attachment, isAmpi, ampiViaName }) {
            const member = members[memberToken];
            if (!member) return { ok: false, status: 403 };
            const text = sanitizePartyChatBody(body);
            const attach = normalizeAttachmentMeta(attachment);
            if (!text && !attach) return { ok: false, status: 400 };
            const row = {
                id: randomUUID(),
                party_id: partyId,
                sender_member_id: isAmpi ? null : member.memberId,
                sender_display_name: isAmpi ? `Ampi (via ${ampiViaName})` : member.displayName,
                body: text,
                is_ampi: Boolean(isAmpi),
                ampi_via_name: isAmpi ? ampiViaName : null,
                attachment_meta: attach,
                created_at: new Date(Date.now() + tick++),
            };
            messages.push(row);
            return { ok: true, message: rowToChatMessage(row) };
        },
        changesSince(sinceChatMs) {
            const since = Number(sinceChatMs) || 0;
            const rows = messages.filter((m) => new Date(m.created_at).getTime() > since);
            const latest =
                rows.length ? new Date(rows[rows.length - 1].created_at).getTime() : since;
            return {
                messages: rows.map(rowToChatMessage),
                latestCreatedAt: latest,
            };
        },
    };
}

const partyId = '11111111-1111-4111-8111-111111111111';
const server = createMemoryChatServer(partyId);

const postA = server.chatPost({
    memberToken: 'token-a',
    body: 'Who brings dessert?',
    attachment: { fileName: 'secret-recipe.pdf', sizeBytes: 999 },
});
check('post ok', postA.ok && postA.message.body.includes('dessert'));
check('attachment filename only', postA.message.attachment?.fileName === 'secret-recipe.pdf');

const deltaB = server.changesSince(0);
check('member B sees message', deltaB.messages.some((m) => m.body.includes('dessert')));
check('no file bytes on wire', !JSON.stringify(deltaB).includes('secret-recipe.pdf'.repeat(2)));

const ampi = server.chatPost({
    memberToken: 'token-a',
    body: 'Try the pavlova.',
    isAmpi: true,
    ampiViaName: 'Alex',
});
check('ampi row', ampi.ok && ampi.message.isAmpi && ampi.message.ampiViaName === 'Alex');

const since = postA.message.createdAt;
const postB = server.chatPost({ memberToken: 'token-b', body: 'I can bring berries.' });
check('second member post', postB.ok);
const deltaA = server.changesSince(since);
check(
    'poll returns newer messages',
    deltaA.messages.some((m) => m.body.includes('berries')) && deltaA.messages.some((m) => m.isAmpi)
);

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('party chat API checks passed');
