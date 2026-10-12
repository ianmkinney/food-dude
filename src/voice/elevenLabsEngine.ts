import { toElevenLabsText } from '../chat/messageText';
import { deviceSpeechEngine, describeVoiceError, type SpeakOptions, type SpeechEngine } from './speech';
import { getElevenLabsConfig } from './elevenLabsSettings';
import { readAudioResponse, speakInChunks, stopElevenLabsPlayback, type SynthesizedAudio } from './elevenLabsPlayback';
import {
    buildElevenLabsTtsBodyForUser,
    prepareElevenLabsSpeechText,
    pickElevenLabsModelChain,
    ELEVEN_FLASH,
} from './elevenLabsTtsRequest';

async function upstreamError(res: Response): Promise<Error> {
    const body = await res.text().catch(() => '');
    let detail = body;
    try {
        const json = JSON.parse(body);
        detail = json?.detail?.message || json?.detail?.status || json?.detail || json?.message || body;
    } catch {
        // not JSON
    }
    return new Error(
        `ElevenLabs said ${res.status}: ${String(detail).replace(/\s+/g, ' ').slice(0, 200) || res.statusText}`
    );
}

async function synthesize(apiKey: string, voiceId: string, displayChunk: string): Promise<SynthesizedAudio> {
    const spoken = await prepareElevenLabsSpeechText(displayChunk);
    const models = pickElevenLabsModelChain(spoken);
    let lastRes: Response | null = null;
    const postTts = (body: Record<string, unknown>) =>
        fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
            {
                method: 'POST',
                headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
                body: JSON.stringify(body),
            }
        );

    for (const modelId of models) {
        let body = await buildElevenLabsTtsBodyForUser(spoken, modelId);
        let res = await postTts(body);
        if (!res.ok && res.status === 404 && body.pronunciation_dictionary_locators?.length) {
            const { pronunciation_dictionary_locators: _drop, ...without } = body;
            body = without;
            res = await postTts(body);
        }
        if (res.ok) return readAudioResponse(res);
        lastRes = res;
        if (res.status === 400 || res.status === 404) continue;
        break;
    }
    if (lastRes) throw await upstreamError(lastRes);
    const fallbackBody = await buildElevenLabsTtsBodyForUser(spoken, ELEVEN_FLASH);
    const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
            body: JSON.stringify(fallbackBody),
        }
    );
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
