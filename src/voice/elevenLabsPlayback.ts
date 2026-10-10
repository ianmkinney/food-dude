import { Platform } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

let player: AudioPlayer | null = null;
let webObjectUrl: string | null = null;

function releaseWebUrl() {
    if (webObjectUrl && typeof URL !== 'undefined') {
        URL.revokeObjectURL(webObjectUrl);
        webObjectUrl = null;
    }
}

export function stopElevenLabsPlayback() {
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Buffer } = require('buffer') as { Buffer: { from: (b: string, enc: string) => { toString: (e: string) => string } } };
    return Buffer.from(binary, 'binary').toString('base64');
}

async function uriFromFetch(res: Response, mime = 'audio/mpeg'): Promise<string> {
    const bytes = await res.arrayBuffer();
    if (Platform.OS === 'web') {
        const blob = new Blob([bytes], { type: mime });
        webObjectUrl = URL.createObjectURL(blob);
        return webObjectUrl;
    }
    const base64 = arrayBufferToBase64(bytes);
    const path = `${FileSystem.cacheDirectory ?? ''}elevenlabs-play-${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(path, base64, { encoding: 'base64' });
    return path;
}

export async function playElevenLabsFromResponse(res: Response, maxMs = 30_000): Promise<void> {
    if (!res.ok) throw new Error('Could not play audio.');
    const playUri = await uriFromFetch(res);
    await playElevenLabsAudio(playUri, maxMs);
}

/** Play a remote HTTPS preview or a local file URI; stops any prior clip. */
export async function playElevenLabsAudio(uri: string, maxMs = 30_000): Promise<void> {
    stopElevenLabsPlayback();
    let playUri = uri;
    if (uri.startsWith('http')) {
        const res = await fetch(uri);
        if (!res.ok) throw new Error('Could not play voice preview.');
        playUri = await uriFromFetch(res);
    }
    await new Promise<void>((resolve, reject) => {
        try {
            player = createAudioPlayer({ uri: playUri });
            player.play();
            const finish = () => {
                stopElevenLabsPlayback();
                resolve();
            };
            const sub = player.addListener('playbackStatusUpdate', (status) => {
                if (status.didJustFinish) {
                    sub.remove();
                    finish();
                }
            });
            setTimeout(() => {
                sub.remove();
                finish();
            }, maxMs);
        } catch (error) {
            stopElevenLabsPlayback();
            reject(error);
        }
    });
}
