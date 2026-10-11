import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';

async function syncFetch(action: string, init: RequestInit = {}) {
    const token = await getOwnerSessionToken();
    if (!token) throw new Error('Sign in with Google to sync.');
    const method = init.method || 'POST';
    const url =
        method === 'GET'
            ? `${getApiBaseUrl()}/backup?action=${encodeURIComponent(action)}`
            : `${getApiBaseUrl()}/backup?action=${encodeURIComponent(action)}`;
    const response = await fetch(url, {
        ...init,
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(init.headers || {}),
        },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body.message || body.error || 'Sync request failed.');
    }
    return body;
}

export type RemoteSyncRecord = {
    collection: string;
    recordId: string;
    seq: number;
    updatedAtMs: number;
    deviceId: string;
    deleted: boolean;
    payload: Record<string, unknown> | null;
};

export async function pullSyncBatch(cursor: number) {
    return syncFetch('sync-pull', {
        method: 'POST',
        body: JSON.stringify({ action: 'sync-pull', cursor }),
    }) as Promise<{ records: RemoteSyncRecord[]; nextCursor: number; hasMore: boolean }>;
}

export async function pushSyncBatch(deviceId: string, records: object[]) {
    return syncFetch('sync-push', {
        method: 'POST',
        body: JSON.stringify({ action: 'sync-push', deviceId, records }),
    });
}

export async function fetchSyncStatus() {
    return syncFetch('sync-status', { method: 'GET' }) as Promise<{
        recordCount: number;
        nextSeq: number;
        lastPushAt: number | null;
        lastPullAt: number | null;
    }>;
}
