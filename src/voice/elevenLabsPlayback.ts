import { chunkForSpeech } from '../chat/messageText';
import { playAudioBytes, playAudioUrl, stopAudio } from './audioOut';

export type SynthesizedAudio = { bytes: ArrayBuffer; mime: string };

// Bumped by every stop or new reply, so a reply that's still fetching audio
// doesn't start talking over the next one.
let generation = 0;

export function stopElevenLabsPlayback() {
    generation += 1;
    stopAudio();
}

/** Play a remote HTTPS preview clip; stops any prior clip. */
export async function playElevenLabsAudio(uri: string, maxMs = 30_000): Promise<void> {
    stopElevenLabsPlayback();
    await playAudioUrl(uri, maxMs);
}

/** Reads a TTS response body as audio, or throws with what came back instead. */
export async function readAudioResponse(res: Response): Promise<SynthesizedAudio> {
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const bytes = await res.arrayBuffer();
    if (!mime.startsWith('audio/')) {
        throw new Error(`Expected audio but got ${mime || 'no content type'} (${bytes.byteLength} bytes).`);
    }
    if (!bytes.byteLength) throw new Error('The voice service returned empty audio.');
    return { bytes, mime };
}

/**
 * Speaks `text` in TTS-sized chunks, fetching the next chunk while the current
 * one plays. Resolves when done or when playback is stopped.
 */
export async function speakInChunks(text: string, synthesize: (chunk: string) => Promise<SynthesizedAudio>): Promise<void> {
    stopElevenLabsPlayback();
    const mine = generation;
    const chunks = chunkForSpeech(text, 800);
    if (!chunks.length) return;
    let pending = synthesize(chunks[0]);
    for (let i = 0; i < chunks.length; i += 1) {
        const audio = await pending;
        if (mine !== generation) return;
        if (i + 1 < chunks.length) {
            pending = synthesize(chunks[i + 1]);
            pending.catch(() => undefined);
        }
        await playAudioBytes(audio.bytes, audio.mime, Math.min(180_000, 20_000 + chunks[i].length * 150));
        if (mine !== generation) return;
    }
}
