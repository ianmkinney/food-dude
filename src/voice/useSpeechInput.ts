import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASSISTANT_NAME } from '../config/assistant';
import { SPEECH_ON_DEVICE_ONLY } from '../config/voice';
import {
    buildDisplayTranscript,
    commitSessionToAccumulated,
    finalizeTranscript,
    formatRecordingElapsed,
    MAX_SPEECH_INPUT_MS,
    shouldRestartRecognitionAfterEnd,
} from './speechInputSession';
import { getWebRecognitionCtor, readTranscriptParts, type WebRecognition } from './webSpeechRecognition';

// Tap-to-talk for Ampi: listens until the user taps stop (or the safety cap).
// Web uses the browser Web Speech API (see WEB_SPEECH_NOTICE). iOS Safari may
// end recognition after a pause; we restart and append until the user stops.

export const ANDROID_MIC_RATIONALE = `Talk instead of type? ${ASSISTANT_NAME} listens until you tap stop. You can always type instead.`;
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
    /** Full display text (committed + interim) while recording. */
    transcript: string;
    /** Interim tail within the current recognition session (web / native). */
    interimTranscript: string;
    recordingElapsedSec: number;
    recordingElapsedLabel: string;
    error: string | null;
    isSupported: boolean;
    /** True when recognition runs in the browser and may leave the device. */
    isWeb: boolean;
    start: () => Promise<void>;
    stop: () => void;
    pressProps: { onPress?: () => void };
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
          ? null
          : code === 'aborted'
            ? null
            : message || `Speech recognition stopped (${code}).`;

function useRecordingElapsed(active: boolean): number {
    const [elapsedSec, setElapsedSec] = useState(0);
    useEffect(() => {
        if (!active) {
            setElapsedSec(0);
            return undefined;
        }
        const started = Date.now();
        setElapsedSec(0);
        const tick = () => setElapsedSec(Math.floor((Date.now() - started) / 1000));
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [active]);
    return elapsedSec;
}

function useWebSpeechInput(onFinal: (text: string) => void): SpeechInput {
    const Ctor = getWebRecognitionCtor();
    const supported = !!Ctor;
    const [state, setState] = useState<SpeechInputState>(supported ? 'idle' : 'unavailable');
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const onFinalRef = useRef(onFinal);
    onFinalRef.current = onFinal;
    const recRef = useRef<WebRecognition | null>(null);
    const accumulatedRef = useRef('');
    const sessionTextRef = useRef('');
    const userStoppedRef = useRef(false);
    const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recordingElapsedSec = useRecordingElapsed(state === 'listening');

    const clearSafetyTimer = () => {
        if (safetyTimerRef.current) {
            clearTimeout(safetyTimerRef.current);
            safetyTimerRef.current = null;
        }
    };

    const resetSessionRefs = () => {
        accumulatedRef.current = '';
        sessionTextRef.current = '';
        userStoppedRef.current = false;
    };

    const updateDisplay = useCallback(() => {
        const display = buildDisplayTranscript(accumulatedRef.current, sessionTextRef.current);
        setTranscript(display);
        setInterimTranscript(sessionTextRef.current.trim());
    }, []);

    const deliverIfNeeded = useCallback(() => {
        const text = finalizeTranscript(accumulatedRef.current, sessionTextRef.current).trim();
        resetSessionRefs();
        setTranscript('');
        setInterimTranscript('');
        setState('idle');
        if (text) onFinalRef.current(text);
    }, []);

    useEffect(
        () => () => {
            clearSafetyTimer();
            userStoppedRef.current = true;
            recRef.current?.abort();
        },
        []
    );

    const attachRecognition = useCallback(
        (rec: WebRecognition) => {
            rec.lang = 'en-US';
            rec.interimResults = true;
            rec.continuous = true;
            rec.onresult = (event) => {
                const parts = readTranscriptParts(event);
                sessionTextRef.current = parts.display;
                updateDisplay();
            };
            rec.onerror = (event) => {
                if (event.error === 'aborted' && userStoppedRef.current) return;
                const msg = errorText(event.error, event.message);
                if (msg) setError(msg);
                userStoppedRef.current = true;
                clearSafetyTimer();
                setState('idle');
            };
            rec.onend = () => {
                if (userStoppedRef.current) {
                    setState('idle');
                    return;
                }
                if (!shouldRestartRecognitionAfterEnd(userStoppedRef.current)) return;
                accumulatedRef.current = commitSessionToAccumulated(
                    accumulatedRef.current,
                    sessionTextRef.current
                );
                sessionTextRef.current = '';
                updateDisplay();
                if (!Ctor) return;
                try {
                    const next = new Ctor();
                    attachRecognition(next);
                    recRef.current = next;
                    next.start();
                } catch (e) {
                    setError((e as Error)?.message || 'Could not restart the microphone.');
                    setState('idle');
                }
            };
        },
        [Ctor, updateDisplay]
    );

    const startRecognition = useCallback(() => {
        if (!Ctor) return;
        const rec = new Ctor();
        attachRecognition(rec);
        recRef.current = rec;
        rec.start();
        setState('listening');
    }, [Ctor, attachRecognition]);

    const start = useCallback(async () => {
        if (!Ctor) {
            setError("This browser doesn't offer speech recognition. Type your message instead.");
            return;
        }
        recRef.current?.abort();
        clearSafetyTimer();
        setError(null);
        resetSessionRefs();
        setTranscript('');
        setInterimTranscript('');
        try {
            startRecognition();
            safetyTimerRef.current = setTimeout(() => {
                userStoppedRef.current = true;
                recRef.current?.stop();
                deliverIfNeeded();
            }, MAX_SPEECH_INPUT_MS);
        } catch (e) {
            setError((e as Error)?.message || 'Could not start the microphone.');
            setState('idle');
        }
    }, [Ctor, deliverIfNeeded, startRecognition]);

    const stop = useCallback(() => {
        if (state !== 'listening') return;
        userStoppedRef.current = true;
        clearSafetyTimer();
        const text = finalizeTranscript(accumulatedRef.current, sessionTextRef.current).trim();
        accumulatedRef.current = '';
        sessionTextRef.current = '';
        setTranscript('');
        setInterimTranscript('');
        recRef.current?.stop();
        setState('idle');
        if (text) onFinalRef.current(text);
    }, [state]);

    const toggle = useCallback(() => {
        if (state === 'listening') stop();
        else void start();
    }, [state, start, stop]);

    return {
        state,
        transcript,
        interimTranscript,
        recordingElapsedSec,
        recordingElapsedLabel: formatRecordingElapsed(recordingElapsedSec),
        error,
        isSupported: supported,
        isWeb: true,
        start,
        stop,
        pressProps: { onPress: toggle },
    };
}

function joinNativeResults(event: { results?: Array<{ transcript?: string }> }): string {
    const list = event.results ?? [];
    return list.map((r) => r.transcript ?? '').join(' ').trim();
}

function useNativeSpeechInput(onFinal: (text: string) => void): SpeechInput {
    const mod = loadRecognizer();
    const supported = supportsOnDevice(mod);
    const [state, setState] = useState<SpeechInputState>(supported ? 'idle' : 'unavailable');
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const onFinalRef = useRef(onFinal);
    onFinalRef.current = onFinal;
    const accumulatedRef = useRef('');
    const sessionTextRef = useRef('');
    const userStoppedRef = useRef(false);
    const listeningRef = useRef(false);
    const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recordingElapsedSec = useRecordingElapsed(state === 'listening');

    const clearSafetyTimer = () => {
        if (safetyTimerRef.current) {
            clearTimeout(safetyTimerRef.current);
            safetyTimerRef.current = null;
        }
    };

    const stopRef = useRef<() => void>(() => {});

    const startRecognition = useCallback(async () => {
        if (!mod || !supported) return;
        mod.start({
            lang: 'en-US',
            interimResults: true,
            continuous: true,
            requiresOnDeviceRecognition: true,
            addsPunctuation: true,
        });
        listeningRef.current = true;
        setState('listening');
    }, [mod, supported]);

    useEffect(() => {
        if (!mod || !supported) return undefined;
        const subs = [
            mod.addListener('result', (event) => {
                const text = joinNativeResults(event);
                sessionTextRef.current = text;
                const display = buildDisplayTranscript(accumulatedRef.current, text);
                setTranscript(display);
                setInterimTranscript(event.isFinal ? '' : text);
            }),
            mod.addListener('error', (event) => {
                if (event.error === 'aborted' && userStoppedRef.current) return;
                setError(
                    event.error === 'not-allowed'
                        ? `Microphone or speech access is off. Turn it on in Settings to talk to ${ASSISTANT_NAME}, or type instead.`
                        : event.error === 'no-speech'
                          ? null
                          : event.message || 'Speech recognition stopped.'
                );
                userStoppedRef.current = true;
                listeningRef.current = false;
                clearSafetyTimer();
                setState('idle');
            }),
            mod.addListener('end', async () => {
                if (userStoppedRef.current || !listeningRef.current) {
                    listeningRef.current = false;
                    setState('idle');
                    return;
                }
                if (!shouldRestartRecognitionAfterEnd(userStoppedRef.current)) return;
                accumulatedRef.current = commitSessionToAccumulated(
                    accumulatedRef.current,
                    sessionTextRef.current
                );
                sessionTextRef.current = '';
                setTranscript(accumulatedRef.current);
                setInterimTranscript('');
                try {
                    await startRecognition();
                } catch {
                    setState('idle');
                    listeningRef.current = false;
                }
            }),
        ];
        return () => subs.forEach((sub) => sub.remove());
    }, [mod, supported, startRecognition]);

    const start = useCallback(async () => {
        if (!mod || !supported) {
            setError("Voice input needs on-device speech recognition, which this device doesn't have. Type your message instead.");
            return;
        }
        setError(null);
        accumulatedRef.current = '';
        sessionTextRef.current = '';
        userStoppedRef.current = false;
        listeningRef.current = false;
        setTranscript('');
        setInterimTranscript('');
        if (!(await confirmAndroidRationale())) return;
        const permission = await mod.requestPermissionsAsync();
        if (!permission.granted) {
            setError(
                `${ASSISTANT_NAME} needs the microphone and on-device speech recognition. You can allow them in Settings, or type instead.`
            );
            return;
        }
        clearSafetyTimer();
        await startRecognition();
        safetyTimerRef.current = setTimeout(() => {
            stopRef.current();
        }, MAX_SPEECH_INPUT_MS);
    }, [mod, supported, startRecognition]);

    const stop = useCallback(() => {
        if (!mod || state !== 'listening') return;
        userStoppedRef.current = true;
        listeningRef.current = false;
        clearSafetyTimer();
        const text = finalizeTranscript(accumulatedRef.current, sessionTextRef.current).trim();
        accumulatedRef.current = '';
        sessionTextRef.current = '';
        setTranscript('');
        setInterimTranscript('');
        mod.stop();
        setState('idle');
        if (text) onFinalRef.current(text);
    }, [mod, state]);

    stopRef.current = stop;

    const toggle = useCallback(() => {
        if (state === 'listening') stop();
        else void start();
    }, [state, start, stop]);

    useEffect(
        () => () => {
            clearSafetyTimer();
            userStoppedRef.current = true;
            listeningRef.current = false;
            mod?.stop();
        },
        [mod]
    );

    return {
        state,
        transcript,
        interimTranscript,
        recordingElapsedSec,
        recordingElapsedLabel: formatRecordingElapsed(recordingElapsedSec),
        error,
        isSupported: supported,
        isWeb: false,
        start,
        stop,
        pressProps: { onPress: toggle },
    };
}

export const useSpeechInput: (onFinal: (text: string) => void) => SpeechInput =
    Platform.OS === 'web' ? useWebSpeechInput : useNativeSpeechInput;
