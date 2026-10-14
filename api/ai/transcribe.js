import { applyCors } from '../_lib/cors.js';
import { isEmailAllowed, isOwnerGateConfigured, requireSecrets } from '../_lib/env.js';
import { isElevenLabsConfigured } from '../_lib/elevenLabs.js';
import { decodeAudioBase64, normalizeAudioMime, transcribeWithElevenLabs } from '../_lib/elevenLabsStt.js';
import { bearerToken, verifySession } from '../_lib/session.js';
import { checkMinuteRateLimit } from '../_lib/store.js';

const STT_REQUESTS_PER_MINUTE = 12;

const MSG = {
    method_not_allowed: 'Method not allowed.',
    platform_disabled: 'Owner platform AI is not enabled.',
    misconfigured: 'Server configuration error.',
    unauthorized: 'Sign in with Google to use the microphone on this installed app.',
    not_allowed: 'This Google account is not authorized.',
    voice_unavailable: 'Voice transcription is not available right now.',
    rate_limited: 'Too many voice messages. Wait a moment and try again.',
    bad_request: 'Invalid request.',
    upstream_failed: "Couldn't turn speech into text. Try again.",
};

function reject(res, status, error, detail) {
    console.warn(`[ai/transcribe] ${status} ${error}${detail ? `: ${detail}` : ''}`);
    res.status(status).json({
        error,
        message: MSG[error] || 'Request failed.',
        ...(detail ? { detail: String(detail).slice(0, 300) } : null),
    });
}

export default async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
        reject(res, 405, 'method_not_allowed');
        return;
    }
    if (!isOwnerGateConfigured()) {
        reject(res, 503, 'platform_disabled');
        return;
    }
    try {
        requireSecrets();
    } catch (error) {
        console.error('[ai/transcribe] secrets:', error?.message || error);
        reject(res, 503, 'misconfigured');
        return;
    }
    if (!isElevenLabsConfigured()) {
        reject(res, 503, 'voice_unavailable');
        return;
    }

    const token = bearerToken(req);
    if (!token) {
        reject(res, 401, 'unauthorized');
        return;
    }
    let session;
    try {
        session = await verifySession(token);
    } catch {
        reject(res, 401, 'unauthorized');
        return;
    }
    if (!isEmailAllowed(session.email)) {
        reject(res, 403, 'not_allowed');
        return;
    }
    if (!checkMinuteRateLimit(`stt:${session.sub}`, STT_REQUESTS_PER_MINUTE)) {
        reject(res, 429, 'rate_limited');
        return;
    }

    let audio;
    let mimeType;
    try {
        audio = decodeAudioBase64(req.body?.audioBase64);
        mimeType = normalizeAudioMime(req.body?.mimeType);
    } catch (error) {
        reject(res, 400, 'bad_request', error?.message);
        return;
    }

    try {
        const { text } = await transcribeWithElevenLabs({ audio, mimeType });
        res.status(200).json({ text });
    } catch (error) {
        console.error('[ai/transcribe] upstream failed:', error?.message || error);
        const status = error?.status;
        reject(res, status === 400 || status === 413 ? 400 : 502, 'upstream_failed', error?.message);
    }
}
