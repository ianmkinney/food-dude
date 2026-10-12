import { checkMinuteRateLimit } from './store.js';
import {
    buildElevenLabsTtsBody,
    isPronunciationDictionaryNotFoundError,
} from './elevenLabsPronunciation.js';

export const ELEVENLABS_TTS_MAX_CHARS = 1000;
export const ELEVENLABS_REQUESTS_PER_MINUTE = 20;
export const ELEVENLABS_V4_MODEL = 'eleven_v4';
export const ELEVENLABS_V4_TURBO_MODEL = 'eleven_v4_turbo';
export const ELEVENLABS_EXPRESSIVE_MODEL = 'eleven_v3';
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

const AUDIO_TAG =
    /\[(?:[a-z][a-z'-]*(?:,\s*[a-z][a-z'-]*){0,3}|long pause|pause)\](?!\()/gi;
const SSML_TAG = /<\/?(?:speak|break|emphasis|prosody|voice|say-as|sub|phoneme|audio|mark)[^>]*>/gi;

export function hasAudioTags(text) {
    AUDIO_TAG.lastIndex = 0;
    return AUDIO_TAG.test(text);
}

export function stripAudioTags(text) {
    return text
        .replace(AUDIO_TAG, '')
        .replace(SSML_TAG, '')
        .replace(/<break[^>]*\/?>/gi, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([,.!?;:])/g, '$1')
        .trim();
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

export class ElevenLabsUpstreamError extends Error {
    constructor(status, message) {
        super(`HTTP ${status}: ${message}`);
        this.status = status;
    }
}

function upstreamMessage(status, text) {
    try {
        const json = JSON.parse(text);
        const detail = json?.detail;
        const msg =
            (detail && typeof detail === 'object' ? detail.message || detail.status : detail) || json?.message;
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
        throw new ElevenLabsUpstreamError(response.status, upstreamMessage(response.status, text));
    }
    const data = await response.json();
    return sanitizeVoices(data);
}

export function defaultVoiceSettings() {
    return {
        stability: 0.38,
        similarity_boost: 0.72,
        style: 0.45,
        use_speaker_boost: true,
    };
}

export async function fetchElevenLabsTts({ voiceId, text, modelId = ELEVENLABS_V4_MODEL, voiceSettings }) {
    const apiKey = getElevenLabsApiKey();
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`;
    const basePayload = {
        text: String(text).replace(SSML_TAG, '').replace(/<break[^>]*\/?>/gi, ''),
        model_id: modelId,
        voice_settings: voiceSettings || defaultVoiceSettings(),
    };

    let includeLocators = true;
    for (let attempt = 0; attempt < 2; attempt++) {
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                    'content-type': 'application/json',
                    accept: 'audio/mpeg',
                },
                body: JSON.stringify(
                    buildElevenLabsTtsBody(basePayload, { includeLocators }),
                ),
            });
        } catch (error) {
            throw new Error(`Couldn't reach ElevenLabs: ${error?.message || 'network error'}`);
        }
        if (!response.ok) {
            const bodyText = await response.text().catch(() => '');
            const message = upstreamMessage(response.status, bodyText);
            if (
                includeLocators &&
                isPronunciationDictionaryNotFoundError(response.status, message)
            ) {
                includeLocators = false;
                continue;
            }
            throw new ElevenLabsUpstreamError(response.status, message);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length) {
            throw new Error('Empty audio response');
        }
        return buffer;
    }
    throw new ElevenLabsUpstreamError(404, 'Pronunciation dictionary not found');
}

function reject(res, status, error, detail) {
    console.warn(`[ai/chat] elevenlabs ${status} ${error}${detail ? `: ${detail}` : ''}`);
    res.status(status).json({
        error,
        message: ELEVENLABS_MSG[error] || 'Request failed.',
        ...(detail ? { detail: String(detail).slice(0, 300) } : null),
    });
}

const MODEL_CHAIN_TAGGED = [
    ELEVENLABS_V4_MODEL,
    ELEVENLABS_V4_TURBO_MODEL,
    ELEVENLABS_EXPRESSIVE_MODEL,
    ELEVENLABS_DEFAULT_MODEL,
];
const MODEL_CHAIN_PLAIN = [ELEVENLABS_V4_MODEL, ELEVENLABS_DEFAULT_MODEL, ELEVENLABS_EXPRESSIVE_MODEL];

/**
 * Prefer eleven_v4 (turbo for retry), then v3 for tagged text, then flash.
 */
export async function synthesizeWithFallback({ voiceId, text }) {
    const trimmed = validateTtsText(text);
    const tagged = hasAudioTags(trimmed);
    const chain = tagged ? MODEL_CHAIN_TAGGED : MODEL_CHAIN_PLAIN;
    let lastError;
    for (const modelId of chain) {
        try {
            const audio = await fetchElevenLabsTts({ voiceId, text: trimmed, modelId });
            return { audio, model: modelId };
        } catch (error) {
            lastError = error;
            const status = error?.status;
            if (status === 400 || status === 404) continue;
        }
    }
    const plain = stripAudioTags(trimmed);
    if (plain && plain !== trimmed) {
        try {
            const audio = await fetchElevenLabsTts({
                voiceId,
                text: plain,
                modelId: ELEVENLABS_DEFAULT_MODEL,
            });
            return { audio, model: ELEVENLABS_DEFAULT_MODEL };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('ElevenLabs TTS failed');
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
            reject(res, 502, 'upstream_failed', error?.message);
        }
        return;
    }

    let voiceId;
    let text;
    try {
        voiceId = validateVoiceId(req.body?.voiceId);
        text = validateTtsText(req.body?.text);
    } catch (error) {
        reject(res, 400, 'bad_request', error?.message);
        return;
    }

    try {
        const { audio, model } = await synthesizeWithFallback({ voiceId, text });
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', String(audio.length));
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-ElevenLabs-Model', model);
        res.status(200).send(audio);
    } catch (error) {
        console.error('[ai/chat] elevenlabs tts failed:', error?.message || error);
        reject(res, 502, 'upstream_failed', error?.message);
    }
}
