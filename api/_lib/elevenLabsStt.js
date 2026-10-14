import { ElevenLabsUpstreamError, resolveElevenLabsApiKey } from './elevenLabs.js';

export const ELEVENLABS_STT_MODEL = 'scribe_v1';
export const STT_MAX_BYTES = 3 * 1024 * 1024;

const AUDIO_MIME = /^audio\/(mp4|mpeg|webm|wav|aac|ogg|x-m4a|m4a|mp4a-latm)$/;

export function decodeAudioBase64(audioBase64) {
    if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
        throw new Error('Missing audio');
    }
    const cleaned = audioBase64.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
        throw new Error('Invalid audio data');
    }
    const bytes = Buffer.from(cleaned, 'base64');
    if (!bytes.length) throw new Error('Missing audio');
    if (bytes.length > STT_MAX_BYTES) throw new Error('Audio too long');
    return bytes;
}

export function normalizeAudioMime(mime) {
    const bare = String(mime || '').split(';')[0].trim().toLowerCase();
    if (bare === 'audio/mp3') return 'audio/mpeg';
    if (bare === 'audio/x-m4a' || bare === 'audio/m4a' || bare === 'audio/mp4a-latm') return 'audio/mp4';
    if (AUDIO_MIME.test(bare)) return bare;
    return 'audio/mp4';
}

export function audioFilename(mime) {
    if (mime.includes('webm')) return 'speech.webm';
    if (mime.includes('wav')) return 'speech.wav';
    if (mime.includes('mpeg')) return 'speech.mp3';
    if (mime.includes('ogg')) return 'speech.ogg';
    if (mime.includes('aac')) return 'speech.aac';
    return 'speech.m4a';
}

export function readTranscriptText(payload) {
    if (!payload || typeof payload !== 'object') return '';
    return String(payload.text || '').trim();
}

/**
 * @param {{ audio: Buffer, mimeType: string }} input
 * @returns {Promise<{ text: string }>}
 */
export async function transcribeWithElevenLabs({ audio, mimeType }) {
    const apiKey = resolveElevenLabsApiKey();
    if (!apiKey) {
        throw new Error('ELEVENLABS_API_KEY is not set');
    }
    const mime = normalizeAudioMime(mimeType);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), audioFilename(mime));
    form.append('model_id', ELEVENLABS_STT_MODEL);
    form.append('language_code', 'en');
    form.append('tag_audio_events', 'false');

    let response;
    try {
        response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
            method: 'POST',
            headers: { 'xi-api-key': apiKey },
            body: form,
        });
    } catch (error) {
        throw new Error(`Couldn't reach ElevenLabs: ${error?.message || 'network error'}`);
    }
    const raw = await response.text().catch(() => '');
    let payload = {};
    try {
        payload = raw ? JSON.parse(raw) : {};
    } catch {
        payload = {};
    }
    if (!response.ok) {
        const detail = payload?.detail;
        const message =
            (detail && typeof detail === 'object' ? detail.message || detail.status : detail) ||
            payload?.message ||
            raw.replace(/\s+/g, ' ').trim().slice(0, 300) ||
            `HTTP ${response.status}`;
        throw new ElevenLabsUpstreamError(response.status, String(message).slice(0, 300));
    }
    return { text: readTranscriptText(payload) };
}
