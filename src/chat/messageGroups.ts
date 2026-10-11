type Groupable = { role: string; createdAt: number };

/** Messages from the same side within this gap share one bubble group. */
export const GROUP_GAP_MS = 5 * 60 * 1000;
/** A centered timestamp appears before the first message and after a pause this long. */
export const TIME_GAP_MS = 15 * 60 * 1000;

export type GroupPosition = { first: boolean; last: boolean; showTime: boolean };

export function groupPosition(messages: Groupable[], index: number): GroupPosition {
    const current = messages[index];
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const joins = (a?: Groupable, b?: Groupable) =>
        Boolean(a && b && a.role === b.role && Math.abs(b.createdAt - a.createdAt) < GROUP_GAP_MS);
    return {
        first: !joins(prev, current),
        last: !joins(current, next),
        showTime: !prev || current.createdAt - prev.createdAt >= TIME_GAP_MS,
    };
}

export function formatChatTime(ms: number, now = Date.now()): string {
    const date = new Date(ms);
    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    if (ms >= startOfToday.getTime()) return `Today ${time}`;
    if (ms >= startOfToday.getTime() - dayMs) return `Yesterday ${time}`;
    if (ms >= startOfToday.getTime() - 6 * dayMs) {
        return `${date.toLocaleDateString(undefined, { weekday: 'long' })} ${time}`;
    }
    return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}
