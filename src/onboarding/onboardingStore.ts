import AsyncStorage from '@react-native-async-storage/async-storage';

const DONE_KEY = 'amplifood.onboarding.v1';
const MUTED_KEY = 'amplifood.voice.muted';

type Listener = () => void;
const listeners = new Set<Listener>();

export async function isOnboardingDone(): Promise<boolean> {
    return (await AsyncStorage.getItem(DONE_KEY)) != null;
}

export async function markOnboardingDone(): Promise<void> {
    await AsyncStorage.setItem(DONE_KEY, JSON.stringify({ completedAt: Date.now() }));
}

/** Settings → Replay tour. */
export async function replayOnboarding(): Promise<void> {
    await AsyncStorage.removeItem(DONE_KEY);
    listeners.forEach((fn) => fn());
}

export function onReplayRequested(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Sous's voice mute; persists across launches and applies to the tour and chat. */
export async function isVoiceMuted(): Promise<boolean> {
    return (await AsyncStorage.getItem(MUTED_KEY)) === 'true';
}

export async function setVoiceMuted(muted: boolean): Promise<void> {
    await AsyncStorage.setItem(MUTED_KEY, String(muted));
}
