import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { VoicePlaybackError } from './voiceErrors';

let player: AudioPlayer | null = null;
let finishCurrent: (() => void) | null = null;

export function isAudioUnlocked(): boolean {
    return true;
}

/** Native apps can start audio at any time. */
export function unlockAudio(): void {}

export function stopAudio(): void {
    player?.remove();
    player = null;
    const finish = finishCurrent;
    finishCurrent = null;
    finish?.();
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

export function playAudioUrl(uri: string, maxMs: number): Promise<void> {
    stopAudio();
    return new Promise<void>((resolve, reject) => {
        try {
            const current = createAudioPlayer({ uri });
            player = current;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const finish = () => {
                if (timer) clearTimeout(timer);
                sub.remove();
                if (finishCurrent === finish) finishCurrent = null;
                if (player === current) {
                    current.remove();
                    player = null;
                }
                resolve();
            };
            const sub = current.addListener('playbackStatusUpdate', (status) => {
                if (status.didJustFinish) finish();
            });
            finishCurrent = finish;
            timer = setTimeout(finish, maxMs);
            current.play();
        } catch (error) {
            stopAudio();
            reject(new VoicePlaybackError('decode', `Couldn't play the voice audio (${(error as Error)?.message || 'unknown error'}).`));
        }
    });
}

export async function playAudioBytes(bytes: ArrayBuffer, _mime: string, maxMs: number): Promise<void> {
    const base64 = arrayBufferToBase64(bytes);
    const path = `${FileSystem.cacheDirectory ?? ''}elevenlabs-play-${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(path, base64, { encoding: 'base64' });
    try {
        await playAudioUrl(path, maxMs);
    } finally {
        FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
    }
}
