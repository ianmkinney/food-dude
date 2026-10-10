import { deviceSpeechEngine, toSpokenText, type SpeechEngine } from './speech';
import { getElevenLabsConfig } from './elevenLabsSettings';
import { playElevenLabsFromResponse, stopElevenLabsPlayback } from './elevenLabsPlayback';

const MODEL_ID = 'eleven_flash_v2_5';

export function createElevenLabsEngine(): SpeechEngine {
    return {
        id: 'elevenlabs',
        speak: async (text) => {
            const { apiKey, voiceId } = await getElevenLabsConfig();
            if (!apiKey || !voiceId) {
                await deviceSpeechEngine.speak(text);
                return;
            }
            stopElevenLabsPlayback();
            const spoken = toSpokenText(text);
            const res = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
                {
                    method: 'POST',
                    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
                    body: JSON.stringify({ text: spoken, model_id: MODEL_ID }),
                }
            );
            if (!res.ok) {
                await deviceSpeechEngine.speak(text);
                return;
            }
            try {
                await playElevenLabsFromResponse(res, Math.min(120_000, spoken.length * 120));
            } catch {
                await deviceSpeechEngine.speak(text);
            }
        },
        stop: () => {
            stopElevenLabsPlayback();
            deviceSpeechEngine.stop();
        },
    };
}
