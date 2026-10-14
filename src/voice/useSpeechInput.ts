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
import { isWebStandalone } from '../layout/useLayoutMode';
import {
    captureEngine,
    isIosWeb,
    microphoneErrorMessage,
    pickRecorderMime,
    SERVER_SPEECH_NOTICE,
    tearDownCapture,
} from './speechCapture';
import { transcribeRecordedAudio } from './serverTranscribe';
import { getWebRecognitionCtor, readTranscriptParts, WEB_SPEECH_NOTICE, type WebRecognition } from './webSpeechRecognition';

// Tap-to-talk for Ampi: listens until the user taps stop (or the safety cap).
// A Safari tab uses the browser Web Speech API. An installed iOS app records
// and sends the clip to the server, because webkitSpeechRecognition there
// stays on "Listening" and its stop() can throw. iOS Safari may end a browser
// recognition session after a pause; we restart and append until the user stops.

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
    /** Non-error status, such as waiting on server transcription. */
    status: string | null;
    /** Where the audio goes, shown while listening. */
    notice: string;
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

function webCapturePlan() {
    const standaloneIos =
        typeof navigator !== 'undefined' && isWebStandalone() && isIosWeb(navigator.userAgent || '');
    const hasWebSpeech = !!getWebRecognitionCtor();
    const hasRecorder =
        typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    return {
        standaloneIos,
        hasWebSpeech,
        engine: captureEngine({ standaloneIos, hasWebSpeech, hasRecorder }),
    };
}

function useWebSpeechInput(onFinal: (text: string) => void): SpeechInput {
    const Ctor = getWebRecognitionCtor();
    const plan = webCapturePlan();
    const supported = plan.engine !== 'none' || plan.hasWebSpeech;
    const notice = plan.engine === 'server' ? SERVER_SPEECH_NOTICE : WEB_SPEECH_NOTICE;
    const [state, setState] = useState<SpeechInputState>(supported ? 'idle' : 'unavailable');
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const onFinalRef = useRef(onFinal);
    onFinalRef.current = onFinal;
    const recRef = useRef<WebRecognition | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const accumulatedRef = useRef('');
    const sessionTextRef = useRef('');
    const userStoppedRef = useRef(false);
    const stoppingRef = useRef(false);
    const listeningRef = useRef(false);
    const engineRef = useRef<'server' | 'web' | 'none'>('none');
    const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stopRef = useRef<() => void>(() => {});
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

    const releaseCapture = useCallback(async () => {
        const rec = recRef.current;
        const recorder = recorderRef.current;
        const stream = streamRef.current;
        const hadRecorder = !!recorder;
        const mime = recorder?.mimeType || 'audio/mp4';
        recRef.current = null;
        recorderRef.current = null;
        if (recorder && recorder.state !== 'inactive') {
            await new Promise<void>((resolve) => {
                let settled = false;
                const done = () => {
                    if (settled) return;
                    settled = true;
                    resolve();
                };
                recorder.addEventListener('stop', done, { once: true });
                tearDownCapture({ recognition: rec, recorder, stream });
                setTimeout(done, 1500);
            });
        } else {
            tearDownCapture({ recognition: rec, recorder, stream });
        }
        streamRef.current = null;
        const chunks = chunksRef.current.slice();
        chunksRef.current = [];
        return { chunks, mime, hadRecorder };
    }, []);

    const finish = useCallback(async () => {
        if (stoppingRef.current) return;
        if (!listeningRef.current && !recRef.current && !recorderRef.current && !streamRef.current) return;
        stoppingRef.current = true;
        userStoppedRef.current = true;
        listeningRef.current = false;
        clearSafetyTimer();
        const engine = engineRef.current;
        const text = finalizeTranscript(accumulatedRef.current, sessionTextRef.current).trim();
        accumulatedRef.current = '';
        sessionTextRef.current = '';
        const { chunks, mime, hadRecorder } = await releaseCapture();
        setTranscript('');
        setInterimTranscript('');
        setState('idle');
        if (engine === 'server') {
            const blob = new Blob(chunks, { type: mime });
            if (!blob.size) {
                setStatus(null);
                if (hadRecorder) {
                    setError(`Didn't catch any speech. Try again, or type your message to ${ASSISTANT_NAME}.`);
                }
                stoppingRef.current = false;
                return;
            }
            setStatus('Turning speech into text…');
            try {
                const heard = await transcribeRecordedAudio(blob, ASSISTANT_NAME);
                setStatus(null);
                if (heard) onFinalRef.current(heard);
                else setError(`Didn't catch any speech. Try again, or type your message to ${ASSISTANT_NAME}.`);
            } catch (e) {
                setStatus(null);
                setError((e as Error)?.message || "Couldn't turn speech into text.");
            }
        } else if (text) {
            onFinalRef.current(text);
        }
        stoppingRef.current = false;
    }, [releaseCapture]);

    useEffect(
        () => () => {
            clearSafetyTimer();
            userStoppedRef.current = true;
            listeningRef.current = false;
            tearDownCapture({
                recognition: recRef.current,
                recorder: recorderRef.current,
                stream: streamRef.current,
            });
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
                listeningRef.current = false;
                clearSafetyTimer();
                const heard = finalizeTranscript(accumulatedRef.current, sessionTextRef.current).trim();
                tearDownCapture({ recognition: recRef.current, stream: streamRef.current });
                recRef.current = null;
                setState('idle');
                if (heard) onFinalRef.current(heard);
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
                    listeningRef.current = false;
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
        listeningRef.current = true;
        setState('listening');
    }, [Ctor, attachRecognition]);

    const armSafetyTimer = useCallback(() => {
        clearSafetyTimer();
        safetyTimerRef.current = setTimeout(() => {
            stopRef.current();
        }, MAX_SPEECH_INPUT_MS);
    }, []);

    const startServerCapture = useCallback(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (userStoppedRef.current) {
            tearDownCapture({ stream });
            listeningRef.current = false;
            setState('idle');
            return;
        }
        streamRef.current = stream;
        const mime = pickRecorderMime((type) => MediaRecorder.isTypeSupported(type));
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
            if (event.data?.size) chunksRef.current.push(event.data);
        };
        recorder.onerror = () => {
            setError(`Recording failed. Type your message to ${ASSISTANT_NAME} instead.`);
            userStoppedRef.current = true;
            listeningRef.current = false;
            tearDownCapture({ recorder, stream });
            recorderRef.current = null;
            streamRef.current = null;
            setState('idle');
        };
        recorderRef.current = recorder;
        recorder.start();
        listeningRef.current = true;
        setState('listening');
        armSafetyTimer();
    }, [armSafetyTimer]);

    const start = useCallback(async () => {
        if (stoppingRef.current) return;
        const nextPlan = webCapturePlan();
        if (nextPlan.engine === 'none') {
            setState('idle');
            setError(
                nextPlan.standaloneIos
                    ? `This installed app can't use the browser's speech recognizer. Type your message to ${ASSISTANT_NAME} instead.`
                    : "This browser doesn't offer speech recognition. Type your message instead."
            );
            return;
        }
        userStoppedRef.current = true;
        await releaseCapture();
        clearSafetyTimer();
        setError(null);
        setStatus(null);
        resetSessionRefs();
        setTranscript('');
        setInterimTranscript('');
        engineRef.current = nextPlan.engine;
        stoppingRef.current = false;
        listeningRef.current = true;
        setState('listening');
        armSafetyTimer();
        try {
            if (nextPlan.engine === 'server') {
                await startServerCapture();
            } else {
                startRecognition();
            }
        } catch (e) {
            listeningRef.current = false;
            clearSafetyTimer();
            await releaseCapture();
            setError(microphoneErrorMessage(e, ASSISTANT_NAME));
            setState('idle');
        }
    }, [armSafetyTimer, releaseCapture, startRecognition, startServerCapture]);

    const stop = useCallback(() => {
        void finish();
    }, [finish]);

    stopRef.current = stop;

    const toggle = useCallback(() => {
        if (listeningRef.current || state === 'listening') stop();
        else void start();
    }, [state, start, stop]);

    return {
        state,
        transcript,
        interimTranscript,
        recordingElapsedSec,
        recordingElapsedLabel: formatRecordingElapsed(recordingElapsedSec),
        error,
        status,
        notice,
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
        try {
            mod.stop();
        } catch {
            // Recognition never started, or already ended. The timer still has to stop.
        }
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
        status: null,
        notice: 'Speech is turned into text on this device.',
        isSupported: supported,
        isWeb: false,
        start,
        stop,
        pressProps: { onPress: toggle },
    };
}

export const useSpeechInput: (onFinal: (text: string) => void) => SpeechInput =
    Platform.OS === 'web' ? useWebSpeechInput : useNativeSpeechInput;
