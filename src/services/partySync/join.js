import { PARTY_PAYLOAD_FORMAT, buildShareLinkForPayload, generateMemberId } from './codec';
import { buildPartyExportDocument } from './model';

export function buildJoinInviteDocument(party, members, meals) {
    const doc = buildPartyExportDocument(party, members, meals);
    doc.intent = 'join';
    return doc;
}

export function buildJoinReceiptDocument({ partyUuid, partyName, version, member, removedMemberIds = [] }) {
    return {
        format: PARTY_PAYLOAD_FORMAT,
        intent: 'join_receipt',
        uuid: partyUuid,
        name: partyName,
        version: Number(version || 1),
        updatedAt: Date.now(),
        member: {
            id: member.id,
            name: member.name,
            joinedAt: member.joinedAt || Date.now(),
            status: 'confirmed',
        },
        removedMemberIds,
    };
}

export async function buildPartyJoinLink(party, members, meals, secret) {
    const doc = buildJoinInviteDocument(party, members, meals);
    return buildShareLinkForPayload(doc, secret, { stripHeavy: true });
}

export async function buildJoinReceiptLink(receiptDoc, secret) {
    return buildShareLinkForPayload(receiptDoc, secret, { stripHeavy: true });
}

export function createJoiningMember(displayName) {
    return {
        id: generateMemberId(),
        name: displayName.trim(),
        joinedAt: Date.now(),
        status: 'confirmed',
        role: 'member',
    };
}
