/** Minimal pantry rows synced to Neon when a member opts in per party. */

const MAX_ITEMS = 500;
const MAX_NAME = 120;

/**
 * @param {unknown} items
 * @returns {{ name: string, quantity?: string | null, unit?: string | null, amountPct?: number | null, freshnessPct?: number | null, expirationDate?: string | null }[]}
 */
export function normalizePantrySnapshotItems(items) {
    if (!Array.isArray(items)) return [];
    const out = [];
    for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const name = String(raw.name || '').trim().slice(0, MAX_NAME);
        if (!name) continue;
        const amountPct = raw.amountPct ?? raw.amount_pct;
        const freshnessPct = raw.freshnessPct ?? raw.freshness_pct;
        out.push({
            name,
            quantity: raw.quantity != null ? String(raw.quantity).slice(0, 40) : null,
            unit: raw.unit != null ? String(raw.unit).slice(0, 24) : null,
            amountPct: Number.isFinite(Number(amountPct)) ? Math.max(0, Math.min(100, Number(amountPct))) : null,
            freshnessPct: Number.isFinite(Number(freshnessPct))
                ? Math.max(0, Math.min(100, Number(freshnessPct)))
                : null,
            expirationDate: raw.expirationDate ?? raw.expiration_date
                ? String(raw.expirationDate ?? raw.expiration_date).slice(0, 32)
                : null,
        });
        if (out.length >= MAX_ITEMS) break;
    }
    return out;
}

/**
 * @param {{ members?: { memberId: string, displayName: string, pantryShareEnabled?: boolean, pantrySnapshot?: object[] }[] }} snapshot
 */
export function partyPantryByMemberFromSnapshot(snapshot) {
    const members = snapshot?.members || [];
    return members
        .filter((m) => m.pantryShareEnabled && Array.isArray(m.pantrySnapshot) && m.pantrySnapshot.length)
        .map((m) => ({
            memberId: m.memberId,
            displayName: m.displayName || 'Member',
            items: normalizePantrySnapshotItems(m.pantrySnapshot),
        }))
        .filter((m) => m.items.length);
}
