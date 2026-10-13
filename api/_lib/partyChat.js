export const MAX_PARTY_CHAT_LEN = 2000;
export const MAX_CHAT_BATCH = 100;

/** Strip control chars and tags; cap length. */
export function sanitizePartyChatBody(raw) {
    if (raw == null) return '';
    let text = String(raw).replace(/\0/g, '');
    text = text.replace(/<[^>]*>/g, '');
    text = text.trim();
    if (text.length > MAX_PARTY_CHAT_LEN) text = text.slice(0, MAX_PARTY_CHAT_LEN);
    return text;
}

export function normalizeAttachmentMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const ampi = meta.ampi && typeof meta.ampi === 'object' ? meta.ampi : null;
    const fileName = String(meta.fileName || meta.name || '').trim().slice(0, 200);
    const sizeBytes = Number(meta.sizeBytes ?? meta.size ?? 0);
    const mimeType = String(meta.mimeType || meta.type || 'application/octet-stream').slice(0, 120);
    if (!fileName && !ampi) return null;
    const out = {
        sizeBytes: Number.isFinite(sizeBytes) ? Math.max(0, Math.min(sizeBytes, 50_000_000)) : 0,
        mimeType,
    };
    if (fileName) out.fileName = fileName;
    if (ampi) {
        out.ampi = {
            cards: Array.isArray(ampi.cards) ? ampi.cards.slice(0, 6) : [],
            pendingActions: Array.isArray(ampi.pendingActions) ? ampi.pendingActions.slice(0, 8) : [],
            failed: Boolean(ampi.failed),
        };
    }
    return out;
}

export function attachmentHasPayload(attachment) {
    if (!attachment || typeof attachment !== 'object') return false;
    if (attachment.fileName) return true;
    return Array.isArray(attachment.ampi?.cards) && attachment.ampi.cards.length > 0;
}

export function mergePartyChatMessages(existing, incoming) {
    const map = new Map((existing || []).map((m) => [m.id, m]));
    for (const m of incoming || []) {
        if (m?.id) map.set(m.id, m);
    }
    return [...map.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function isPendingPartyChatMessage(message) {
    if (!message) return false;
    if (message.sendState === 'pending' || message.sendState === 'failed') return true;
    return String(message.id || '').startsWith('pending-');
}

/** Replace server history while keeping unsent / failed local rows. */
export function mergeServerPartyChatWithLocal(serverMessages, localMessages) {
    const pending = (localMessages || []).filter(isPendingPartyChatMessage);
    return mergePartyChatMessages(serverMessages, pending);
}

export function rowToChatMessage(row) {
    const attachment =
        row.attachment_meta && typeof row.attachment_meta === 'object' ? row.attachment_meta : null;
    return {
        id: row.id,
        partyId: row.party_id,
        senderMemberId: row.sender_member_id,
        senderDisplayName: row.sender_display_name,
        body: row.body || '',
        isAmpi: Boolean(row.is_ampi),
        ampiViaName: row.ampi_via_name || null,
        attachment,
        createdAt: new Date(row.created_at).getTime(),
    };
}
