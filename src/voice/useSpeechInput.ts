import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASSISTANT_NAME } from '../config/assistant';
import { SPEECH_ON_DEVICE_ONLY } from '../config/voice';
import { getWebRecognitionCtor, readTranscript, type WebRecognition } from './webSpeechRecognition';

// Push-to-talk for Ampi: listens while the mic button is held. Native uses
// on-device recognition only when SPEECH_ON_DEVICE_ONLY is true. The web uses
// the browser's Web Speech API, which may be cloud-backed (see WEB_SPEECH_NOTICE).

export const ANDROID_MIC_RATIONALE = `Talk instead of type? ${ASSISTANT_NAME} listens only while you hold the mic button. You can always type instead.`;
const RATIONALE_SEEN_KEY = 'amplifood.mic.rationaleSeen';

type Recognizer = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;

let recognizer: Recognizer | null | undefined;

function loadRecognizer(): Recognizer | null {
    if (Platform.OS === 'web') return null;
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
    /** True when recognition runs in the browser and may leave the device. */
    isWeb: boolean;
    start: () => Promise<void>;
    stop: () => void;
    /** Hold-to-talk on native; tap to start/stop on web, where Safari needs a click to start recognition. */
    pressProps: { onPress?: () => void; onPressIn?: () => void; onPressOut?: () => void };
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

const errorText = (code: string, message?: string) =>
    code === 'not-allowed' || code === 'service-not-allowed'
        ? `Microphone or speech access is off. Allow it in your settings to talk to ${ASSISTANT_NAME}, or type instead.`
        : code === 'no-speech'
          ? "Didn't catch that. Try the mic again."
          : code === 'aborted'
            ? null
            : message || `Speech recognition stopped (${code}).`;

function useWebSpeechInput(onFinal: (text: string) => void): SpeechInput {
    const Ctor = getWebRecognitionCtor();
    const supported = !!Ctor;
    const [state, setState] = useState<SpeechInputState>(supported ? 'idle' : 'unavailable');
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const onFinalRef = useRef(onFinal);
    onFinalRef.current = onFinal;
    const recRef = useRef<WebRecognition | null>(null);
    const latestRef = useRef('');
    const sentRef = useRef(false);

    useEffect(() => () => recRef.current?.abort(), []);

    const deliver = () => {
        const text = latestRef.current.trim();
        if (!sentRef.current && text) {
            sentRef.current = true;
            onFinalRef.current(text);
        }
    };

    // Must run synchronously inside the tap handler: Safari only starts
    // recognition (and shows the mic prompt) from a user gesture.
    const start = useCallback(async () => {
        if (!Ctor) {
            setError("This browser doesn't offer speech recognition. Type your message instead.");
            return;
        }
        recRef.current?.abort();
        setError(null);
        setTranscript('');
        latestRef.current = '';
        sentRef.current = false;
        const rec = new Ctor();
        rec.lang = 'en-US';
        rec.interimResults = true;
        rec.continuous = false;
        rec.onresult = (event) => {
            const { text, isFinal } = readTranscript(event);
            latestRef.current = text;
            setTranscript(text);
            if (isFinal) deliver();
        };
        rec.onerror = (event) => {
            setError(errorText(event.error, event.message));
            setState('idle');
        };
        rec.onend = () => {
            deliver();
            setState('idle');
        };
        recRef.current = rec;
        try {
            rec.start();
            setState('listening');
        } catch (e) {
            setError((e as Error)?.message || 'Could not start the microphone.');
            setState('idle');
        }
    }, [Ctor]);

    const stop = useCallback(() => {
        recRef.current?.stop();
    }, []);

    const toggle = useCallback(() => {
        if (state === 'listening') stop();
        else start();
    }, [state, start, stop]);

    return { state, transcript, error, isSupported: supported, isWeb: true, start, stop, pressProps: { onPress: toggle } };
}

function useNativeSpeechInput(onFinal: (text: string) => void): SpeechInput {
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
            setError("Voice input needs on-device speech recognition, which this device doesn't have. Type your message instead.");
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

    return {
        state,
        transcript,
        error,
        isSupported: supported,
        isWeb: false,
        start,
        stop,
        pressProps: { onPressIn: () => void start(), onPressOut: stop },
    };
}

export const useSpeechInput: (onFinal: (text: string) => void) => SpeechInput =
    Platform.OS === 'web' ? useWebSpeechInput : useNativeSpeechInput;
