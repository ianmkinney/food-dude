import { Platform } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { deviceSpeechEngine, toSpokenText, type SpeechEngine } from './speech';
import { getElevenLabsConfig } from './elevenLabsSettings';

const MODEL_ID = 'eleven_flash_v2_5';

let player: AudioPlayer | null = null;
let webObjectUrl: string | null = null;

function releaseWebUrl() {
    if (webObjectUrl && typeof URL !== 'undefined') {
        URL.revokeObjectURL(webObjectUrl);
        webObjectUrl = null;
    }
}

function stopPlayback() {
    player?.remove();
    player = null;
    releaseWebUrl();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    if (typeof globalThis.btoa === 'function') {
        return globalThis.btoa(binary);
    }
    // Metro / React Native
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Buffer } = require('buffer') as { Buffer: { from: (b: string, enc: string) => { toString: (e: string) => string } } };
    return Buffer.from(binary, 'binary').toString('base64');
}

async function audioUriFromResponse(res: Response): Promise<string> {
    const bytes = await res.arrayBuffer();
    if (Platform.OS === 'web') {
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        webObjectUrl = URL.createObjectURL(blob);
        return webObjectUrl;
    }
    const base64 = arrayBufferToBase64(bytes);
    const path = `${FileSystem.cacheDirectory ?? ''}elevenlabs-${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(path, base64, { encoding: 'base64' });
    return path;
}

export function createElevenLabsEngine(): SpeechEngine {
    return {
        id: 'elevenlabs',
        speak: async (text) => {
            const { apiKey, voiceId } = await getElevenLabsConfig();
            if (!apiKey || !voiceId) {
                await deviceSpeechEngine.speak(text);
                return;
            }
            stopPlayback();
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
            const uri = await audioUriFromResponse(res);
            await new Promise<void>((resolve) => {
                try {
                    player = createAudioPlayer({ uri });
                    player.play();
                    const done = () => {
                        stopPlayback();
                        resolve();
                    };
                    const sub = player.addListener('playbackStatusUpdate', (status) => {
                        if (status.didJustFinish) {
                            sub.remove();
                            done();
                        }
                    });
                    setTimeout(() => {
                        sub.remove();
                        done();
                    }, Math.min(120_000, spoken.length * 120));
                } catch {
                    stopPlayback();
                    deviceSpeechEngine.speak(text).then(resolve);
                }
            });
        },
        stop: () => {
            stopPlayback();
            deviceSpeechEngine.stop();
        },
    };
}
