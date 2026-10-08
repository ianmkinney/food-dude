import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASSISTANT_NAME } from '../config/assistant';
import { SPEECH_ON_DEVICE_ONLY } from '../config/voice';

// Push-to-talk for Ampi: listens while the mic button is held. On-device
// recognition only when SPEECH_ON_DEVICE_ONLY is true.

export const ANDROID_MIC_RATIONALE = `Talk instead of type? ${ASSISTANT_NAME} listens only while you hold the mic button. You can always type instead.`;
const RATIONALE_SEEN_KEY = 'amplifood.mic.rationaleSeen';

type Recognizer = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;

let recognizer: Recognizer | null | undefined;

function loadRecognizer(): Recognizer | null {
    if (recognizer !== undefined) return recognizer;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        recognizer = (require('expo-speech-recognition') as typeof import('expo-speech-recognition'))
            .ExpoSpeechRecognitionModule;
    } catch {
        recognizer = null;
    }
    return recognizer;
}

export type SpeechInputState = 'idle' | 'listening' | 'unavailable';

export type SpeechInput = {
    state: SpeechInputState;
    transcript: string;
    error: string | null;
    isSupported: boolean;
    start: () => Promise<void>;
    stop: () => void;
};

function supportsOnDevice(mod: Recognizer | null): boolean {
    if (!mod) return false;
    try {
        if (!mod.isRecognitionAvailable()) return false;
        if (SPEECH_ON_DEVICE_ONLY) {
            return mod.supportsOnDeviceRecognition?.() === true;
        }
        return true;
    } catch {
        return false;
    }
}

async function confirmAndroidRationale(): Promise<boolean> {
    if (Platform.OS !== 'android' || (await AsyncStorage.getItem(RATIONALE_SEEN_KEY))) return true;
    return new Promise((resolve) => {
        Alert.alert('Use the microphone?', ANDROID_MIC_RATIONALE, [
            { text: 'Type instead', style: 'cancel', onPress: () => resolve(false) },
            {
                text: 'Continue',
                onPress: async () => {
                    await AsyncStorage.setItem(RATIONALE_SEEN_KEY, '1');
                    resolve(true);
                },
            },
        ]);
    });
}

export function useSpeechInput(onFinal: (text: string) => void): SpeechInput {
    const mod = loadRecognizer();
    const supported = supportsOnDevice(mod);
    const [state, setState] = useState<SpeechInputState>(supported ? 'idle' : 'unavailable');
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const onFinalRef = useRef(onFinal);
    onFinalRef.current = onFinal;

    useEffect(() => {
        if (!mod || !supported) return undefined;
        const subs = [
            mod.addListener('result', (event) => {
                const text = event.results?.[0]?.transcript ?? '';
                setTranscript(text);
                if (event.isFinal && text.trim()) {
                    onFinalRef.current(text.trim());
                }
            }),
            mod.addListener('error', (event) => {
                setError(
                    event.error === 'not-allowed'
                        ? `Microphone or speech access is off. Turn it on in Settings to talk to ${ASSISTANT_NAME}, or type instead.`
                        : event.error === 'no-speech'
                          ? "Didn't catch that. Hold the mic and try again."
                          : event.message || 'Speech recognition stopped.'
                );
                setState('idle');
            }),
            mod.addListener('end', () => setState('idle')),
        ];
        return () => subs.forEach((sub) => sub.remove());
    }, [mod, supported]);

    const start = useCallback(async () => {
        if (!mod || !supported) {
            setError(
                Platform.OS === 'web'
                    ? "Voice input needs on-device speech recognition, which this browser doesn't offer. Type your message instead."
                    : "Voice input needs on-device speech recognition, which this device doesn't have. Type your message instead."
            );
            return;
        }
        setError(null);
        setTranscript('');
        if (!(await confirmAndroidRationale())) return;
        const permission = await mod.requestPermissionsAsync();
        if (!permission.granted) {
            setError(
                `${ASSISTANT_NAME} needs the microphone and on-device speech recognition. You can allow them in Settings, or type instead.`
            );
            return;
        }
        mod.start({
            lang: 'en-US',
            interimResults: true,
            continuous: false,
            requiresOnDeviceRecognition: true,
            addsPunctuation: true,
        });
        setState('listening');
    }, [mod, supported]);

    const stop = useCallback(() => {
        mod?.stop();
        setState(supported ? 'idle' : 'unavailable');
    }, [mod, supported]);

    return { state, transcript, error, isSupported: supported, start, stop };
}
