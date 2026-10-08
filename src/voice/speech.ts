import { Platform } from 'react-native';
import * as DeviceSpeech from 'expo-speech';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { getElevenLabsKey, getVoiceSettings } from './voiceSettings';

// Text-to-speech for Sous behind one interface, so the planned AmpliFood voice
// proxy can slot in as another engine without touching the UI.

export interface SpeechEngine {
    readonly id: 'elevenlabs' | 'device';
    speak(text: string): Promise<void>;
    stop(): void;
}

/**
 * Turn chat text into something that reads well aloud. "Sous" is pronounced
 * "Soo" (silent s), so it's respelled for the voice; markdown is dropped.
 */
export function toSpokenText(text: string): string {
    return text
        .replace(/\bSous\b/g, 'Soo')
        .replace(/[*_`#>]+/g, '')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

export const deviceSpeechEngine: SpeechEngine = {
    id: 'device',
    speak: (text) =>
        new Promise<void>((resolve) => {
            DeviceSpeech.speak(toSpokenText(text), {
                language: 'en-US',
                onDone: () => resolve(),
                onStopped: () => resolve(),
                onError: () => resolve(),
            });
        }),
    stop: () => {
        DeviceSpeech.stop().catch(() => {});
    },
};

export function createElevenLabsEngine(apiKey: string, voiceId: string): SpeechEngine {
    let player: AudioPlayer | null = null;
    let objectUrl: string | null = null;

    const release = () => {
        player?.remove();
        player = null;
        if (objectUrl && Platform.OS === 'web') URL.revokeObjectURL(objectUrl);
        objectUrl = null;
    };

    return {
        id: 'elevenlabs',
        async speak(text) {
            release();
            const response = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
                {
                    method: 'POST',
                    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
                    body: JSON.stringify({ text: toSpokenText(text), model_id: 'eleven_flash_v2_5' }),
                }
            );
            if (!response.ok) {
                throw new Error(
                    response.status === 401
                        ? 'ElevenLabs rejected that key. Check it in Account → Voice.'
                        : `ElevenLabs couldn't read this aloud (HTTP ${response.status}).`
                );
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            let uri: string;
            if (Platform.OS === 'web') {
                objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
                uri = objectUrl;
            } else {
                const file = new File(Paths.cache, 'sous-reply.mp3');
                file.create({ overwrite: true });
                file.write(bytes);
                uri = file.uri;
            }
            player = createAudioPlayer({ uri });
            player.play();
        },
        stop: release,
    };
}

/** ElevenLabs when the user has saved a key; otherwise the free on-device voice. */
export async function getSpeechEngine(): Promise<SpeechEngine> {
    const key = await getElevenLabsKey();
    if (!key) return deviceSpeechEngine;
    const { voiceId } = await getVoiceSettings();
    return createElevenLabsEngine(key, voiceId);
}
