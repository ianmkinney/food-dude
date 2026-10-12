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
    const fileName = String(meta.fileName || meta.name || '').trim().slice(0, 200);
    if (!fileName) return null;
    const sizeBytes = Number(meta.sizeBytes ?? meta.size ?? 0);
    const mimeType = String(meta.mimeType || meta.type || 'application/octet-stream').slice(0, 120);
    return {
        fileName,
        sizeBytes: Number.isFinite(sizeBytes) ? Math.max(0, Math.min(sizeBytes, 50_000_000)) : 0,
        mimeType,
    };
}

export function mergePartyChatMessages(existing, incoming) {
    const map = new Map((existing || []).map((m) => [m.id, m]));
    for (const m of incoming || []) {
        if (m?.id) map.set(m.id, m);
    }
    return [...map.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function rowToChatMessage(row) {
    const attachment = row.attachment_meta && typeof row.attachment_meta === 'object' ? row.attachment_meta : null;
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
