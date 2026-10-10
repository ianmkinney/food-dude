import { AccessibilityInfo, Platform } from 'react-native';
import * as DeviceSpeech from 'expo-speech';
import { ASSISTANT_NAME, ASSISTANT_PRONUNCIATION } from '../config/assistant';
import { isVoiceMuted } from './voiceSettings';
import { getElevenLabsConfig } from './elevenLabsSettings';
import { createElevenLabsEngine } from './elevenLabsEngine';
import { getOwnerSessionToken } from '../platform/ownerSession';
import { isPlatformElevenLabsActive } from './platformElevenLabsSettings';
import { createPlatformElevenLabsEngine } from './platformElevenLabsEngine';

// On-device text-to-speech via expo-speech, or optional ElevenLabs BYOK from the device.

export interface SpeechEngine {
    readonly id: 'device' | 'elevenlabs';
    speak(text: string): Promise<void>;
    stop(): void;
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

/** Respell the assistant name so TTS says "AM-pee", not "ah-MEE". */
export function toSpokenText(text: string): string {
    const spokenName = ASSISTANT_PRONUNCIATION.replace(/-/g, ' ');
    return text
        .replace(new RegExp(`\\b${ASSISTANT_NAME}\\b`, 'g'), spokenName)
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

let webSpeechPrimed = false;

/**
 * iOS Safari only lets speechSynthesis talk after it has been used inside a
 * user gesture, and replies arrive after an async AI call. Call this
 * synchronously from a tap (send, mic, voice toggle) so later replies can speak.
 */
export function primeSpeechOnWeb(): void {
    if (Platform.OS !== 'web' || webSpeechPrimed || typeof window === 'undefined') return;
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
    const hasOwnerSession = Boolean(await getOwnerSessionToken());
    if (await isPlatformElevenLabsActive(hasOwnerSession)) {
        return createPlatformElevenLabsEngine();
    }
    return deviceSpeechEngine;
}
