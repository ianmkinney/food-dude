import { deviceSpeechEngine, toSpokenText, type SpeechEngine } from './speech';
import { getPlatformElevenLabsConfig } from './platformElevenLabsSettings';
import { playElevenLabsFromResponse, stopElevenLabsPlayback } from './elevenLabsPlayback';
import { requestPlatformElevenLabsTts } from './platformElevenLabsClient';

export function createPlatformElevenLabsEngine(): SpeechEngine {
    return {
        id: 'elevenlabs',
        speak: async (text) => {
            const { voiceId } = await getPlatformElevenLabsConfig();
            if (!voiceId) {
                await deviceSpeechEngine.speak(text);
                return;
            }
            stopElevenLabsPlayback();
            const spoken = toSpokenText(text);
            const res = await requestPlatformElevenLabsTts(spoken, voiceId);
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
