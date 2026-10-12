// Browser speech-to-text (Web Speech API). Unlike the native path this is not
// on-device: Safari sends audio to Apple and Chrome to Google for recognition,
// so the UI shows WEB_SPEECH_NOTICE before and while listening.

export const WEB_SPEECH_NOTICE = 'On the web, your browser turns speech into text and may send the audio to Apple or Google.';

type RecognitionResultEvent = {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export type WebRecognition = {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((event: RecognitionResultEvent) => void) | null;
    onerror: ((event: { error: string; message?: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
};

type RecognitionCtor = new () => WebRecognition;

export function getWebRecognitionCtor(): RecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Joined transcript of every result so far, and whether the last one is final. */
export function readTranscript(event: RecognitionResultEvent): { text: string; isFinal: boolean } {
    const parts = readTranscriptParts(event);
    return { text: parts.display, isFinal: parts.lastIsFinal };
}

/** Split committed (final) vs interim text within the current browser recognition session. */
export function readTranscriptParts(event: RecognitionResultEvent): {
    committed: string;
    interim: string;
    display: string;
    lastIsFinal: boolean;
} {
    let committed = '';
    let interim = '';
    let lastIsFinal = false;
    for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
            committed += piece;
            lastIsFinal = true;
        } else {
            interim += piece;
            lastIsFinal = false;
        }
    }
    const display = `${committed}${interim}`.trim();
    return {
        committed: committed.trim(),
        interim: interim.trim(),
        display,
        lastIsFinal,
    };
}
