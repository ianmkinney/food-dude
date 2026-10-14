/**
 * One shared add-button position for Recipes, Pantry, and Grocery.
 * Coordinates are 0–1 inside the draggable area so they survive resize and rotation.
 * (1, 1) is the bottom-right, just above the tab bar.
 */

export const FAB_SIZE = 56;
export const FAB_GAP = 12;
export const FAB_MARGIN_X = 20;
export const FAB_ABOVE_TAB_MARGIN = 12;
export const FAB_LONG_PRESS_MS = 3000;
export const FAB_TAP_SLOP_PX = 12;
export const FAB_POSITION_KEY = 'amplifood.fabPosition';

export const DEFAULT_FAB_POSITION = { x: 1, y: 1 };

const listeners = new Set();

export function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
}

export function clampNormalized(pos) {
    return { x: clamp01(pos?.x), y: clamp01(pos?.y) };
}

export function parseFabPosition(raw) {
    if (raw == null || raw === '') return { ...DEFAULT_FAB_POSITION };
    try {
        const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!json || typeof json !== 'object') return { ...DEFAULT_FAB_POSITION };
        if (!Number.isFinite(Number(json.x)) || !Number.isFinite(Number(json.y))) {
            return { ...DEFAULT_FAB_POSITION };
        }
        return clampNormalized(json);
    } catch {
        return { ...DEFAULT_FAB_POSITION };
    }
}

function storage() {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    } catch {
        return null;
    }
}

export function readFabPosition() {
    const store = storage();
    if (!store) return { ...DEFAULT_FAB_POSITION };
    try {
        return parseFabPosition(store.getItem(FAB_POSITION_KEY));
    } catch {
        return { ...DEFAULT_FAB_POSITION };
    }
}

function emit(pos) {
    listeners.forEach((listener) => listener(pos));
}

export function subscribeFabPlacement(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function writeFabPosition(pos) {
    const next = clampNormalized(pos);
    const store = storage();
    const prev = readFabPosition();
    const same = Math.abs(prev.x - next.x) < 0.0005 && Math.abs(prev.y - next.y) < 0.0005;
    if (store && !(same && store.getItem(FAB_POSITION_KEY))) {
        try {
            store.setItem(FAB_POSITION_KEY, JSON.stringify(next));
        } catch {
            // Private mode can reject writes; keep the in-memory position.
        }
    }
    if (!same) emit(next);
    return next;
}

export function resetFabPosition() {
    const store = storage();
    try {
        store?.removeItem(FAB_POSITION_KEY);
    } catch {
        // ignore
    }
    const next = { ...DEFAULT_FAB_POSITION };
    emit(next);
    return next;
}

/**
 * Rectangle the primary (+) button's top-left may occupy.
 * The screen box is the page area below the header and above the tab bar.
 */
export function fabDragBounds({ width, height, insetLeft = 0, insetRight = 0, insetTop = 0 }) {
    const w = Math.max(0, Number(width) || 0);
    const h = Math.max(0, Number(height) || 0);
    const left = Math.max(FAB_MARGIN_X, (Number(insetLeft) || 0) + 8);
    const top = Math.max(8, (Number(insetTop) || 0) + 8);
    const rightLimit = w - Math.max(FAB_MARGIN_X, (Number(insetRight) || 0) + 8) - FAB_SIZE;
    const bottomLimit = h - FAB_ABOVE_TAB_MARGIN - FAB_SIZE;
    return {
        left,
        top,
        right: Math.max(left, rightLimit),
        bottom: Math.max(top, bottomLimit),
        width: w,
        height: h,
    };
}

export function primaryOriginFromNormalized(norm, bounds) {
    const n = clampNormalized(norm);
    const spanX = Math.max(0, bounds.right - bounds.left);
    const spanY = Math.max(0, bounds.bottom - bounds.top);
    return {
        x: bounds.left + n.x * spanX,
        y: bounds.top + n.y * spanY,
    };
}

export function normalizedFromPrimaryOrigin(origin, bounds) {
    const spanX = Math.max(1, bounds.right - bounds.left);
    const spanY = Math.max(1, bounds.bottom - bounds.top);
    return clampNormalized({
        x: (origin.x - bounds.left) / spanX,
        y: (origin.y - bounds.top) / spanY,
    });
}

/** Extra buttons sit to the left of +, so the + cannot slide off the left edge. */
export function clampPrimaryOrigin(origin, bounds, extraCount = 0) {
    const extraWidth = Math.max(0, extraCount) * (FAB_SIZE + FAB_GAP);
    const minX = Math.min(bounds.right, bounds.left + extraWidth);
    return {
        x: Math.min(bounds.right, Math.max(minX, origin.x)),
        y: Math.min(bounds.bottom, Math.max(bounds.top, origin.y)),
    };
}

export function clusterOrigin(norm, bounds, fabCount = 1) {
    const extra = Math.max(0, fabCount - 1);
    const primary = clampPrimaryOrigin(primaryOriginFromNormalized(norm, bounds), bounds, extra);
    return {
        primary,
        left: primary.x - extra * (FAB_SIZE + FAB_GAP),
        top: primary.y,
        width: FAB_SIZE + extra * (FAB_SIZE + FAB_GAP),
        height: FAB_SIZE,
    };
}

/**
 * Keep row delete/edit controls out of the FAB column and let the last row
 * scroll above a button parked at the bottom.
 */
export function listClearance({ norm, bounds, fabCount = 1 }) {
    const cluster = clusterOrigin(norm, bounds, fabCount);
    const width = bounds.width || 0;
    const height = bounds.height || 0;
    const overlapsRight = cluster.left + cluster.width > width - (FAB_SIZE + FAB_MARGIN_X);
    const overlapsLeft = cluster.left < FAB_SIZE + FAB_MARGIN_X;
    const inLowerHalf = height > 0 && cluster.top > height * 0.45;
    const paddingRight = overlapsRight ? Math.ceil(width - cluster.left + 12) : 16;
    const paddingLeft = overlapsLeft ? Math.ceil(cluster.left + cluster.width + 12) : 16;
    const paddingBottom = inLowerHalf ? Math.ceil(height - cluster.top + 16) : 24;
    return {
        paddingLeft: Math.max(16, paddingLeft),
        paddingRight: Math.max(16, paddingRight),
        paddingBottom: Math.max(24, paddingBottom),
    };
}

export function fabSlotIndex(localX, fabCount) {
    const count = Math.max(1, fabCount);
    const slot = FAB_SIZE + FAB_GAP;
    const index = Math.floor(Math.max(0, localX) / slot);
    return Math.max(0, Math.min(count - 1, index));
}

export function isPrimarySlot(localX, fabCount) {
    return fabSlotIndex(localX, fabCount) === Math.max(1, fabCount) - 1;
}

/**
 * What a finger-up means.
 * A long-press that just unlocked placement must not also count as the tap that locks it.
 */
export function resolveFabGestureEnd({ placing, enteredThisGesture, moved }) {
    if (placing && enteredThisGesture) return 'stay';
    if (placing && moved) return 'stay';
    if (placing) return 'exit';
    if (!moved) return 'tap';
    return 'cancel';
}
