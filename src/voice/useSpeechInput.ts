import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSISTANT_NAME } from '../config/assistant';
import { SPEECH_ON_DEVICE_ONLY } from '../config/voice';

// Push-to-talk for the assistant. Uses expo-speech-recognition with on-device
// recognition only when SPEECH_ON_DEVICE_ONLY is true.

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
                          ? "Didn't catch that. Tap Talk and try again."
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
            setError('Voice input isn\'t available here. Type your message instead.');
            return;
        }
        setError(null);
        setTranscript('');
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
