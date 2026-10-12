/** @param {number | null | undefined} n */
export function clampPantryPct(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return 100;
    return Math.max(0, Math.min(100, v));
}

export function normalizePantryPctFields(item) {
    return {
        freshness_pct: clampPantryPct(item?.freshness_pct ?? item?.freshnessPct ?? 100),
        amount_pct: clampPantryPct(item?.amount_pct ?? item?.amountPct ?? 100),
    };
}

export function freshnessLabel(pct) {
    const p = clampPantryPct(pct);
    if (p >= 76) return 'Fresh';
    if (p >= 41) return 'Use soon';
    return 'Going bad';
}

export function amountLabel(pct) {
    const p = clampPantryPct(pct);
    if (p >= 76) return 'Full';
    if (p >= 41) return 'Half';
    return 'Almost out';
}

/** Green → amber → red for freshness bar fill. */
export function freshnessBarColor(pct, theme) {
    const p = clampPantryPct(pct) / 100;
    const green = theme?.accent?.green || '#4F802F';
    const amber = theme?.accent?.yellow || '#E8A317';
    const red = theme?.colors?.error || '#DC2626';
    if (p >= 0.66) {
        const t = (p - 0.66) / 0.34;
        return mixHex(green, amber, 1 - t);
    }
    const t = p / 0.66;
    return mixHex(red, amber, t);
}

export function amountBarColor(pct, theme) {
    const p = clampPantryPct(pct) / 100;
    const low = theme?.colors?.text?.tertiary || '#9CA3AF';
    const high = theme?.primary?.[500] || '#C45C26';
    return mixHex(low, high, p);
}

function mixHex(a, b, t) {
    const parse = (hex) => {
        const h = hex.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };
    const [r1, g1, b1] = parse(a);
    const [r2, g2, b2] = parse(b);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const bl = Math.round(b1 + (b2 - b1) * t);
    return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Prefer items that are low on freshness or amount. */
export function sortPantryByUrgency(items) {
    return [...(items || [])].sort((a, b) => {
        const fa = clampPantryPct(a.freshness_pct);
        const fb = clampPantryPct(b.freshness_pct);
        if (fa !== fb) return fa - fb;
        const aa = clampPantryPct(a.amount_pct);
        const ab = clampPantryPct(b.amount_pct);
        return aa - ab;
    });
}
