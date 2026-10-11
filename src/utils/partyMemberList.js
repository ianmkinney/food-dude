/** Client-side party member list: humans only, deduped for display and counts. */

const NON_HUMAN_NAME =
    /^(ampi|amplifood|food\s*dude|ai\s*chef|assistant|system|bot|unknown|party\s*bot)(\s|$|·)/i;

export function isHumanPartyMemberRow(member) {
    const status = String(member?.member_status || 'confirmed').toLowerCase();
    if (status === 'removed') return false;
    return isHumanName(member);
}

function isHumanName(member) {
    const name = String(member?.user_name || member?.userName || '').trim();
    if (!name) return false;
    if (NON_HUMAN_NAME.test(name)) return false;
    const lower = name.toLowerCase();
    if (lower === 'owner' || lower === 'member') return false;
    const uid = String(member?.user_id || '').toLowerCase();
    if (uid.includes('ampi') || uid.includes('assistant') || uid.includes('system')) return false;
    return true;
}

function memberKey(member) {
    const email = member.member_email ? String(member.member_email).toLowerCase() : '';
    if (email) return `email:${email}`;
    if (member.sync_member_id) return `sync:${member.sync_member_id}`;
    if (member.user_id) return `uid:${member.user_id}`;
    return `id:${member.id}`;
}

function pickRow(a, b) {
    if (a.role === 'owner' && b.role !== 'owner') return a;
    if (b.role === 'owner' && a.role !== 'owner') return b;
    const at = Number(a.joined_at) || 0;
    const bt = Number(b.joined_at) || 0;
    return at <= bt ? a : b;
}

/**
 * @param {object[]} members
 * @param {{ ownerEmail?: string | null, partyOwnerUserId?: string | null }} [opts]
 */
export function normalizePartyMembersForDisplay(members, opts = {}) {
    const ownerEmail = opts.ownerEmail ? String(opts.ownerEmail).toLowerCase() : '';
    const filtered = (members || []).filter((m) => {
        if (!isHumanPartyMemberRow(m)) return false;
        if (ownerEmail && m.member_email && String(m.member_email).toLowerCase() === ownerEmail) {
            return true;
        }
        return true;
    });

    const map = new Map();
    for (const m of filtered) {
        const key = memberKey(m);
        const prev = map.get(key);
        map.set(key, prev ? pickRow(prev, m) : m);
    }

    let list = Array.from(map.values());

    if (ownerEmail) {
        const ownerMatches = list.filter(
            (m) => m.member_email && String(m.member_email).toLowerCase() === ownerEmail
        );
        if (ownerMatches.length > 1) {
            const keep = ownerMatches.reduce(pickRow);
            list = list.filter((m) => {
                if (!m.member_email || String(m.member_email).toLowerCase() !== ownerEmail) return true;
                return m.id === keep.id;
            });
        }
    }

    if (opts.partyOwnerUserId) {
        const ownerRows = list.filter((m) => m.role === 'owner');
        if (ownerRows.length > 1) {
            const keep =
                ownerRows.find((m) => m.user_id === opts.partyOwnerUserId) ||
                ownerRows.reduce(pickRow);
            list = list.filter((m) => m.role !== 'owner' || m.id === keep.id);
        }
    }

    return list.sort((a, b) => (Number(a.joined_at) || 0) - (Number(b.joined_at) || 0));
}
