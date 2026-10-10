import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';

async function backupFetch(path, options = {}) {
    const token = await getOwnerSessionToken();
    if (!token) throw new Error('Sign in in Account to use cloud backup.');
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
    };
    const res = await fetch(`${getApiBaseUrl()}${path}`, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(body.message || body.error || 'Backup request failed.');
    }
    return body;
}

export async function listCloudBackups() {
    const data = await backupFetch('/backup?action=list', { method: 'GET' });
    return data.backups || [];
}

export async function uploadCloudBackup({ base64, schemaVersion, appVersion }) {
    return backupFetch('/backup?action=upload', {
        method: 'POST',
        body: JSON.stringify({
            action: 'upload',
            payloadBase64: base64,
            schemaVersion,
            appVersion,
        }),
    });
}

export async function downloadCloudBackup(backupId) {
    return backupFetch('/backup?action=get', {
        method: 'POST',
        body: JSON.stringify({ action: 'get', backupId }),
    });
}

export async function deleteCloudBackup(backupId) {
    return backupFetch('/backup?action=delete', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', backupId }),
    });
}
