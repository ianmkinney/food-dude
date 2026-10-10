import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';
import type { ElevenLabsVoice } from './elevenLabsSettings';

export class PlatformElevenLabsError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = 'PlatformElevenLabsError';
        this.status = status;
        this.code = code;
    }
}

export async function fetchOwnerSessionElevenLabsAvailable(): Promise<boolean> {
    const token = await getOwnerSessionToken();
    if (!token) return false;
    try {
        const response = await fetch(`${getApiBaseUrl()}/auth/session`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return false;
        const body = (await response.json()) as { elevenlabsAvailable?: boolean };
        return Boolean(body.elevenlabsAvailable);
    } catch {
        return false;
    }
}

export async function listPlatformElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
    const token = await getOwnerSessionToken();
    if (!token) {
        throw new PlatformElevenLabsError(401, 'unauthorized', 'Sign in with owner sign-in in Account.');
    }
    const url = `${getApiBaseUrl()}/ai/chat`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mode: 'voices' }),
        });
    } catch (error) {
        throw new PlatformElevenLabsError(0, 'network', `Couldn't reach ${url} (${(error as Error)?.message || 'network error'})`);
    }
    const raw = await response.text().catch(() => '');
    let payload: { voices?: ElevenLabsVoice[]; error?: string; message?: string } = {};
    try {
        payload = raw ? JSON.parse(raw) : {};
    } catch {
        // non-JSON
    }
    if (!response.ok) {
        const reason =
            payload?.message ||
            payload?.error ||
            raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) ||
            response.statusText ||
            'request failed';
        throw new PlatformElevenLabsError(response.status, payload?.error || '', reason);
    }
    return payload.voices || [];
}

export async function requestPlatformElevenLabsTts(text: string, voiceId: string): Promise<Response> {
    const token = await getOwnerSessionToken();
    if (!token) {
        throw new PlatformElevenLabsError(401, 'unauthorized', 'Sign in with owner sign-in in Account.');
    }
    const url = `${getApiBaseUrl()}/ai/chat`;
    try {
        return await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mode: 'tts', voiceId, text }),
        });
    } catch (error) {
        throw new PlatformElevenLabsError(0, 'network', `Couldn't reach ${url} (${(error as Error)?.message || 'network error'})`);
    }
}
