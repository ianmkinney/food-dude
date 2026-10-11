import { hasAudioTags, stripAudioTags, toElevenLabsText } from '../chat/messageText';
import { deviceSpeechEngine, describeVoiceError, type SpeakOptions, type SpeechEngine } from './speech';
import { getElevenLabsConfig } from './elevenLabsSettings';
import { readAudioResponse, speakInChunks, stopElevenLabsPlayback, type SynthesizedAudio } from './elevenLabsPlayback';

const EXPRESSIVE_MODEL = 'eleven_v3';
const FAST_MODEL = 'eleven_flash_v2_5';

async function upstreamError(res: Response): Promise<Error> {
    const body = await res.text().catch(() => '');
    let detail = body;
    try {
        const json = JSON.parse(body);
        detail = json?.detail?.message || json?.detail?.status || json?.detail || json?.message || body;
    } catch {
        // not JSON
    }
    return new Error(`ElevenLabs said ${res.status}: ${String(detail).replace(/\s+/g, ' ').slice(0, 200) || res.statusText}`);
}

/** Audio tags need eleven_v3; if v3 fails, the same line without tags on the fast model. */
async function synthesize(apiKey: string, voiceId: string, chunk: string): Promise<SynthesizedAudio> {
    const request = (text: string, modelId: string) =>
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
            body: JSON.stringify({ text, model_id: modelId }),
        });
    if (hasAudioTags(chunk)) {
        const expressive = await request(chunk, EXPRESSIVE_MODEL).catch(() => null);
        if (expressive?.ok) return readAudioResponse(expressive);
    }
    const res = await request(stripAudioTags(chunk), FAST_MODEL);
    if (!res.ok) throw await upstreamError(res);
    return readAudioResponse(res);
}

export function createElevenLabsEngine(): SpeechEngine {
    return {
        id: 'elevenlabs',
        speak: async (text, options?: SpeakOptions) => {
            const { apiKey, voiceId } = await getElevenLabsConfig();
            if (!apiKey || !voiceId) {
                await deviceSpeechEngine.speak(text);
                return;
            }
            try {
                await speakInChunks(toElevenLabsText(text), (chunk) => synthesize(apiKey, voiceId, chunk));
            } catch (error) {
                if (options?.strict) throw error;
                options?.onIssue?.(`${describeVoiceError(error)} Using the built-in voice instead.`);
                await deviceSpeechEngine.speak(text);
            }
        },
        stop: () => {
            stopElevenLabsPlayback();
            deviceSpeechEngine.stop();
        },
    };
}
