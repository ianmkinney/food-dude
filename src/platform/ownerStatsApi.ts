import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from './ownerSession';

export type StatField = { value: number | null } | { error: string };

export type OwnerOpenRouterStats = {
    cachedAt: number;
    fromCache?: boolean;
    credits: StatField;
    spendToday: StatField;
    spendThisWeek: StatField;
    spendThisMonth: StatField;
    limit: StatField | null;
    limitRemaining: StatField | null;
    callsThisWeek: StatField | null;
    activityNote?: string | null;
};

export async function fetchOwnerOpenRouterStats(refresh = false): Promise<OwnerOpenRouterStats> {
    const token = await getOwnerSessionToken();
    if (!token) {
        throw new Error('Sign in with an allowlisted Google account first.');
    }
    const response = await fetch(`${getApiBaseUrl()}/ai/chat`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'stats', refresh }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body?.message || body?.error || `Stats request failed (${response.status})`);
    }
    return body as OwnerOpenRouterStats;
}
