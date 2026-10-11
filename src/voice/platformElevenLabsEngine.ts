import { toElevenLabsText } from '../chat/messageText';
import { deviceSpeechEngine, describeVoiceError, type SpeakOptions, type SpeechEngine } from './speech';
import { getPlatformElevenLabsConfig } from './platformElevenLabsSettings';
import { speakInChunks, stopElevenLabsPlayback } from './elevenLabsPlayback';
import { synthesizePlatformTts } from './platformElevenLabsClient';

export function createPlatformElevenLabsEngine(): SpeechEngine {
    return {
        id: 'elevenlabs',
        speak: async (text, options?: SpeakOptions) => {
            const { voiceId } = await getPlatformElevenLabsConfig();
            if (!voiceId) {
                const message = 'Pick an owner voice in Account → Ampi voice first.';
                if (options?.strict) throw new Error(message);
                options?.onIssue?.(message);
                await deviceSpeechEngine.speak(text);
                return;
            }
            try {
                await speakInChunks(toElevenLabsText(text), (chunk) => synthesizePlatformTts(chunk, voiceId));
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
