import { AccessibilityInfo, Platform } from 'react-native';
import * as DeviceSpeech from 'expo-speech';
import { toSpokenText } from '../chat/messageText';
import { isVoiceMuted } from './voiceSettings';
import { getElevenLabsConfig } from './elevenLabsSettings';
import { createElevenLabsEngine } from './elevenLabsEngine';
import { isPlatformElevenLabsActive } from './platformElevenLabsSettings';
import { createPlatformElevenLabsEngine } from './platformElevenLabsEngine';
import { unlockAudio } from './audioOut';
import { VoicePlaybackError } from './voiceErrors';

export { toSpokenText };

// On-device text-to-speech via expo-speech, or optional ElevenLabs BYOK from the device.

export type SpeakOptions = {
    /** Called when the premium voice failed and the built-in voice was used instead. */
    onIssue?: (message: string) => void;
    /** Throw instead of falling back (Account voice test). */
    strict?: boolean;
};

export interface SpeechEngine {
    readonly id: 'device' | 'elevenlabs';
    speak(text: string, options?: SpeakOptions): Promise<void>;
    stop(): void;
}

export function describeVoiceError(error: unknown): string {
    if (error instanceof VoicePlaybackError) return error.message;
    const message = (error as Error)?.message;
    return message ? `ElevenLabs voice failed: ${message}` : 'ElevenLabs voice failed.';
}

/**
 * Every assistant voice output checks this first: nothing plays when the user has
 * muted the voice or a screen reader is running (the on-screen text, which
 * doubles as the caption, is read by VoiceOver/TalkBack instead).
 */
export async function shouldSpeak(): Promise<boolean> {
    if (await isVoiceMuted()) return false;
    if (Platform.OS === 'web') return true;
    try {
        if (await AccessibilityInfo.isScreenReaderEnabled()) return false;
    } catch {
        // Not available everywhere; keep going.
    }
    return true;
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

let webSpeechPrimed = false;

/**
 * iOS Safari only lets speechSynthesis and <audio> play after they have been
 * used inside a user gesture, and replies arrive after an async AI call. Call
 * this synchronously from a tap (send, mic, speaker, voice toggle) so later
 * replies can speak.
 */
export function primeSpeechOnWeb(): void {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    unlockAudio();
    if (webSpeechPrimed) return;
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
        const utterance = new SpeechSynthesisUtterance(' ');
        utterance.volume = 0;
        synth.speak(utterance);
        webSpeechPrimed = true;
    } catch {
        // Speech stays text-only.
    }
}

export async function getSpeechEngine(): Promise<SpeechEngine> {
    const { apiKey, voiceId } = await getElevenLabsConfig();
    if (apiKey && voiceId) {
        return createElevenLabsEngine();
    }
    const { hasPlatformAiAccess } = await import('../platform/ownerSession');
    if (await isPlatformElevenLabsActive(await hasPlatformAiAccess())) {
        return createPlatformElevenLabsEngine();
    }
    return deviceSpeechEngine;
}
