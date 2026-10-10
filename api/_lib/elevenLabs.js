import { checkMinuteRateLimit } from './store.js';

export const ELEVENLABS_TTS_MAX_CHARS = 1000;
export const ELEVENLABS_REQUESTS_PER_MINUTE = 20;
export const ELEVENLABS_DEFAULT_MODEL = 'eleven_flash_v2_5';
const OUTPUT_FORMAT = 'mp3_44100_128';

const VOICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export const ELEVENLABS_MSG = {
    voice_unavailable: 'Owner ElevenLabs voice is not available.',
    bad_request: 'Invalid request.',
    rate_limited: 'Too many requests. Wait a moment and try again.',
    upstream_failed: 'Voice request failed. Try again later.',
};

/** Empty or placeholder values mean owner voice is off (e.g. Vercel env not rotated yet). */
export function resolveElevenLabsApiKey(raw = process.env.ELEVENLABS_API_KEY) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === 'replace_me') return null;
    return trimmed;
}

export function isElevenLabsConfigured() {
    return resolveElevenLabsApiKey() !== null;
}

function getElevenLabsApiKey() {
    const key = resolveElevenLabsApiKey();
    if (!key) {
        throw new Error('ELEVENLABS_API_KEY is not set');
    }
    return key;
}

export function validateTtsText(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('Missing text');
    }
    const trimmed = text.trim();
    if (!trimmed) {
        throw new Error('Missing text');
    }
    if (trimmed.length > ELEVENLABS_TTS_MAX_CHARS) {
        throw new Error('Text too long');
    }
    return trimmed;
}

export function validateVoiceId(voiceId) {
    if (!voiceId || typeof voiceId !== 'string') {
        throw new Error('Missing voiceId');
    }
    const trimmed = voiceId.trim();
    if (!VOICE_ID_RE.test(trimmed)) {
        throw new Error('Invalid voiceId');
    }
    return trimmed;
}

function upstreamMessage(status, text) {
    try {
        const json = JSON.parse(text);
        const msg = json?.detail?.message || json?.detail || json?.message;
        if (msg) return String(msg).slice(0, 300);
    } catch {
        // not JSON
    }
    return (text || '').replace(/\s+/g, ' ').trim().slice(0, 300) || `HTTP ${status}`;
}

function sanitizeVoices(data) {
    const list = Array.isArray(data?.voices) ? data.voices : [];
    return list
        .map((v) => {
            if (!v || typeof v !== 'object') return null;
            const voice_id = v.voice_id;
            const name = v.name;
            if (!voice_id || !name) return null;
            return {
                voice_id: String(voice_id),
                name: String(name),
                preview_url: v.preview_url ? String(v.preview_url) : null,
                category: v.category ? String(v.category) : null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function fetchElevenLabsVoices() {
    const apiKey = getElevenLabsApiKey();
    let response;
    try {
        response = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': apiKey },
        });
    } catch (error) {
        throw new Error(`Couldn't reach ElevenLabs: ${error?.message || 'network error'}`);
    }
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(upstreamMessage(response.status, text));
    }
    const data = await response.json();
    return sanitizeVoices(data);
}

export async function fetchElevenLabsTts({ voiceId, text }) {
    const apiKey = getElevenLabsApiKey();
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'content-type': 'application/json',
                accept: 'audio/mpeg',
            },
            body: JSON.stringify({
                text,
                model_id: ELEVENLABS_DEFAULT_MODEL,
            }),
        });
    } catch (error) {
        throw new Error(`Couldn't reach ElevenLabs: ${error?.message || 'network error'}`);
    }
    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(upstreamMessage(response.status, bodyText));
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
        throw new Error('Empty audio response');
    }
    return buffer;
}

function reject(res, status, error) {
    console.warn(`[ai/chat] elevenlabs ${status} ${error}`);
    res.status(status).json({
        error,
        message: ELEVENLABS_MSG[error] || 'Request failed.',
    });
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{ sub: string }} session
 * @param {'voices' | 'tts'} mode
 */
export async function handleElevenLabsMode(req, res, session, mode) {
    if (!isElevenLabsConfigured()) {
        reject(res, 503, 'voice_unavailable');
        return;
    }

    const rateKey = `elevenlabs:${session.sub}`;
    if (!checkMinuteRateLimit(rateKey, ELEVENLABS_REQUESTS_PER_MINUTE)) {
        reject(res, 429, 'rate_limited');
        return;
    }

    if (mode === 'voices') {
        try {
            const voices = await fetchElevenLabsVoices();
            res.status(200).json({ voices });
        } catch (error) {
            console.error('[ai/chat] elevenlabs voices failed:', error?.message || error);
            reject(res, 502, 'upstream_failed');
        }
        return;
    }

    let voiceId;
    let text;
    try {
        voiceId = validateVoiceId(req.body?.voiceId);
        text = validateTtsText(req.body?.text);
    } catch (error) {
        console.warn('[ai/chat] elevenlabs tts bad request:', error?.message || error);
        reject(res, 400, 'bad_request');
        return;
    }

    try {
        const audio = await fetchElevenLabsTts({ voiceId, text });
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(audio);
    } catch (error) {
        console.error('[ai/chat] elevenlabs tts failed:', error?.message || error);
        reject(res, 502, 'upstream_failed');
    }
}
