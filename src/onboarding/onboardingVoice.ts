import { AccessibilityInfo } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { deviceSpeechEngine } from '../voice/speech';
import { AUDIO, AUDIO_IS_PLACEHOLDER, LINES, type LineId } from './script';
import { isVoiceMuted } from './onboardingStore';

// Plays a scripted line. Silent when muted or when VoiceOver/TalkBack is on
// (the screen reader reads the caption instead). Never advances anything:
// callers wait for the user's tap.

let player: AudioPlayer | null = null;

export function stopLine() {
    player?.remove();
    player = null;
    deviceSpeechEngine.stop();
}

export async function shouldSpeak(): Promise<boolean> {
    if (await isVoiceMuted()) return false;
    try {
        if (await AccessibilityInfo.isScreenReaderEnabled()) return false;
    } catch {
        // Not available on every platform; fall through.
    }
    return true;
}

export async function playLine(id: LineId): Promise<void> {
    stopLine();
    if (!(await shouldSpeak())) return;
    if (AUDIO_IS_PLACEHOLDER) {
        await deviceSpeechEngine.speak(LINES[id]);
        return;
    }
    try {
        player = createAudioPlayer(AUDIO[id]);
        player.play();
    } catch {
        await deviceSpeechEngine.speak(LINES[id]);
    }
}
