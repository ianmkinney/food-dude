import { AccessibilityInfo, Platform } from 'react-native';
import * as DeviceSpeech from 'expo-speech';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { getElevenLabsKey, getVoiceSettings, isVoiceMuted } from './voiceSettings';
import { getPremiumVoiceAccess } from './premiumAccess';
import { PremiumVoiceNotLiveError, platformVoice } from './platformVoice';
import preview from '../../assets/audio/premium-voice/preview.json';
import { ensureConsent } from '../consent/consentStore';

// Text-to-speech for Sous behind one interface, so the planned AmpliFood voice
// proxy can slot in as another engine without touching the UI.

export interface SpeechEngine {
    readonly id: 'elevenlabs' | 'platform' | 'device';
    speak(text: string): Promise<void>;
    stop(): void;
}

/**
 * Every Sous voice output checks this first: nothing plays when the user has
 * muted the voice or a screen reader is running (the on-screen text, which
 * doubles as the caption, is read by VoiceOver/TalkBack instead).
 */
export async function shouldSpeak(): Promise<boolean> {
    if (await isVoiceMuted()) return false;
    // Browsers can't detect screen readers (react-native-web always reports
    // true), so on web the user's mute setting is the control.
    if (Platform.OS === 'web') return true;
    try {
        if (await AccessibilityInfo.isScreenReaderEnabled()) return false;
    } catch {
        // Not available everywhere; keep going.
    }
    return true;
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
            await ensureConsent('elevenlabs');
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

async function playUri(uri: string): Promise<AudioPlayer> {
    const player = createAudioPlayer({ uri });
    player.play();
    return player;
}

/** Plus path: the AmpliFood voice proxy. Falls back to the phone voice while it's a stub. */
function createPlatformEngine(onFallback?: (message: string) => void): SpeechEngine {
    let player: AudioPlayer | null = null;
    return {
        id: 'platform',
        async speak(text) {
            player?.remove();
            try {
                const { audioUri } = await platformVoice.synthesizeSpeech({ text: toSpokenText(text), voice: 'sous' });
                player = await playUri(audioUri);
            } catch (error) {
                if (error instanceof PremiumVoiceNotLiveError) onFallback?.(error.message);
                await deviceSpeechEngine.speak(text);
            }
        },
        stop() {
            player?.remove();
            player = null;
            deviceSpeechEngine.stop();
        },
    };
}

/**
 * Phone voice unless the user picked Premium Sous voice and can use it: their
 * own ElevenLabs key first (billed to them), otherwise Plus via the proxy.
 */
export async function getSpeechEngine(onFallback?: (message: string) => void): Promise<SpeechEngine> {
    const settings = await getVoiceSettings();
    if (settings.choice !== 'premium') return deviceSpeechEngine;
    const access = await getPremiumVoiceAccess();
    if (access.via === 'byok') {
        const key = await getElevenLabsKey();
        if (key) return createElevenLabsEngine(key, settings.voiceId);
    }
    if (access.via === 'plus') return createPlatformEngine(onFallback);
    return deviceSpeechEngine;
}

// A short, pre-recorded clip of the Premium Sous voice for the paywall and
// settings preview. It's the only bundled premium audio; scripted onboarding
// lines use the phone voice.
export const PREMIUM_PREVIEW_CAPTION: string = preview.caption;
export const PREMIUM_PREVIEW_RECORDED: boolean = !preview.placeholder;
const PREVIEW_CLIP = require('../../assets/audio/premium-voice/preview.wav');

export type PreviewOutcome = 'played' | 'silenced' | 'not_recorded';

let previewPlayer: AudioPlayer | null = null;
export async function playPremiumPreview(): Promise<PreviewOutcome> {
    if (!(await shouldSpeak())) return 'silenced';
    if (!PREMIUM_PREVIEW_RECORDED) return 'not_recorded';
    previewPlayer?.remove();
    previewPlayer = createAudioPlayer(PREVIEW_CLIP);
    previewPlayer.play();
    return 'played';
}
