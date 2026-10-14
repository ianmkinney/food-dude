import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';
import { transcribeFailureMessage } from './speechCapture';

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(binary);
}

/** Send a recorded clip to /api/ai/transcribe and return the transcript. */
export async function transcribeRecordedAudio(blob: Blob, assistantName: string): Promise<string> {
    const token = await getOwnerSessionToken();
    if (!token) {
        throw new Error(transcribeFailureMessage(401, {}, assistantName));
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const url = `${getApiBaseUrl()}/ai/transcribe`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audioBase64: bytesToBase64(bytes),
                mimeType: blob.type || 'audio/mp4',
            }),
        });
    } catch (error) {
        throw new Error(`Couldn't reach the server (${(error as Error)?.message || 'network error'}).`);
    }
    const raw = await response.text().catch(() => '');
    let body: { text?: string; message?: string; detail?: string } = {};
    try {
        body = raw ? JSON.parse(raw) : {};
    } catch {
        body = {};
    }
    if (!response.ok) {
        throw new Error(transcribeFailureMessage(response.status, body, assistantName));
    }
    return String(body.text || '').trim();
}
