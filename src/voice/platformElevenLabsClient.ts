import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';
import type { ElevenLabsVoice } from './elevenLabsSettings';
import { readAudioResponse, type SynthesizedAudio } from './elevenLabsPlayback';

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

const SIGN_IN_MESSAGE = 'Sign in with Google (top bar). Platform voice needs an allowlisted account.';

export type OwnerVoiceSession = {
    signedIn: boolean;
    platformAiAllowed: boolean;
    elevenlabsAvailable: boolean;
    /** Why the session check itself failed, if it did. */
    error?: string;
};

export async function fetchOwnerVoiceSession(): Promise<OwnerVoiceSession> {
    const token = await getOwnerSessionToken();
    if (!token) return { signedIn: false, platformAiAllowed: false, elevenlabsAvailable: false };
    try {
        const response = await fetch(`${getApiBaseUrl()}/auth/session`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await response.json().catch(() => ({}))) as {
            platformAiAllowed?: boolean;
            elevenlabsAvailable?: boolean;
            message?: string;
        };
        if (!response.ok) {
            return {
                signedIn: true,
                platformAiAllowed: false,
                elevenlabsAvailable: false,
                error: body.message || `Session check failed (HTTP ${response.status}).`,
            };
        }
        return {
            signedIn: true,
            platformAiAllowed: Boolean(body.platformAiAllowed),
            elevenlabsAvailable: Boolean(body.elevenlabsAvailable),
        };
    } catch (error) {
        return {
            signedIn: true,
            platformAiAllowed: false,
            elevenlabsAvailable: false,
            error: `Couldn't reach the server (${(error as Error)?.message || 'network error'}).`,
        };
    }
}

export async function fetchOwnerSessionElevenLabsAvailable(): Promise<boolean> {
    return (await fetchOwnerVoiceSession()).elevenlabsAvailable;
}

async function postVoice(body: object): Promise<Response> {
    const token = await getOwnerSessionToken();
    if (!token) throw new PlatformElevenLabsError(401, 'unauthorized', SIGN_IN_MESSAGE);
    const url = `${getApiBaseUrl()}/ai/chat`;
    try {
        return await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (error) {
        throw new PlatformElevenLabsError(0, 'network', `Couldn't reach ${url} (${(error as Error)?.message || 'network error'})`);
    }
}

async function errorFrom(response: Response): Promise<PlatformElevenLabsError> {
    const raw = await response.text().catch(() => '');
    let payload: { error?: string; message?: string; detail?: string } = {};
    try {
        payload = raw ? JSON.parse(raw) : {};
    } catch {
        // non-JSON
    }
    const reason =
        payload.message ||
        payload.error ||
        raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) ||
        response.statusText ||
        'request failed';
    const detail = payload.detail ? ` ElevenLabs said: ${payload.detail}` : '';
    return new PlatformElevenLabsError(response.status, payload.error || '', `${reason}${detail} (HTTP ${response.status})`);
}

export async function listPlatformElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
    const response = await postVoice({ mode: 'voices' });
    if (!response.ok) throw await errorFrom(response);
    const payload = (await response.json().catch(() => ({}))) as { voices?: ElevenLabsVoice[] };
    return payload.voices || [];
}

export async function requestPlatformElevenLabsTts(text: string, voiceId: string): Promise<Response> {
    return postVoice({ mode: 'tts', voiceId, text });
}

/** Text may carry v4 audio tags; the server prefers eleven_v4 with fallbacks. */
export async function synthesizePlatformTts(text: string, voiceId: string): Promise<SynthesizedAudio & { model: string | null }> {
    const response = await requestPlatformElevenLabsTts(text, voiceId);
    if (!response.ok) throw await errorFrom(response);
    const model = response.headers.get('x-elevenlabs-model');
    return { ...(await readAudioResponse(response)), model };
}
