/** @param {string | null | undefined} value */
export function parsePantryExpiration(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    const d = dateOnly ? new Date(`${raw}T12:00:00`) : new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

/** Calendar days from today (local) until expiration; negative if past. */
export function daysUntilExpiration(value) {
    const exp = parsePantryExpiration(value);
    if (!exp) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(exp);
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/**
 * @param {string | null | undefined} value
 * @returns {{ label: string, tone: 'expired' | 'soon' | 'normal' } | null}
 */
export function expirationBadge(value) {
    const days = daysUntilExpiration(value);
    if (days === null) return null;
    if (days < 0) return { label: 'Expired', tone: 'expired' };
    if (days === 0) return { label: 'Expires today', tone: 'soon' };
    if (days === 1) return { label: 'Expires in 1 day', tone: 'soon' };
    if (days <= 7) return { label: `Expires in ${days} days`, tone: 'soon' };
    return { label: `Expires in ${days} days`, tone: 'normal' };
}

/** Soonest / expired items first; items without dates last. */
export function sortPantryItemsByExpiration(items) {
    const rank = (item) => {
        const days = daysUntilExpiration(item.expiration_date);
        if (days === null) return 50_000;
        if (days < 0) return days;
        if (days <= 7) return days;
        return 10_000 + days;
    };
    return [...(items || [])].sort((a, b) => {
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

/** YYYY-MM-DD for storage, or null when cleared. */
export function pantryExpirationToStorage(value) {
    if (!value || !String(value).trim()) return null;
    const d = parsePantryExpiration(value);
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** @param {string | null | undefined} stored */
export function pantryExpirationFromStorage(stored) {
    if (!stored) return '';
    const d = parsePantryExpiration(stored);
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
