export const SERVER_SPEECH_NOTICE =
    'On this installed app, speech is sent to AmpliFood to be turned into text.';

const RECORDER_MIME_TYPES = ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

export function isIosWeb(userAgent = '') {
    return /iPhone|iPad|iPod|CriOS/i.test(String(userAgent));
}

/**
 * Installed iOS web apps expose webkitSpeechRecognition but it stays on
 * "Listening" with no transcript, and stop() can throw so the timer never ends.
 * Record locally and transcribe on the server instead.
 *
 * @param {{ standaloneIos?: boolean, hasWebSpeech?: boolean, hasRecorder?: boolean }} caps
 * @returns {'server' | 'web' | 'none'}
 */
export function captureEngine({ standaloneIos = false, hasWebSpeech = false, hasRecorder = false } = {}) {
    if (standaloneIos && hasRecorder) return 'server';
    if (standaloneIos) return 'none';
    if (hasWebSpeech) return 'web';
    if (hasRecorder) return 'server';
    return 'none';
}

/** @param {(type: string) => boolean} [isTypeSupported] */
export function pickRecorderMime(isTypeSupported) {
    if (typeof isTypeSupported !== 'function') return '';
    for (const type of RECORDER_MIME_TYPES) {
        try {
            if (isTypeSupported(type)) return type;
        } catch {
            // try the next type
        }
    }
    return '';
}

/**
 * Stop recognition, the recorder, and every mic track.
 * Individual failures must not skip the rest.
 *
 * @param {{ recognition?: { abort?: () => void, stop?: () => void } | null, recorder?: { state?: string, stop?: () => void } | null, stream?: { getTracks?: () => Array<{ stop?: () => void }> } | null }} capture
 */
export function tearDownCapture({ recognition = null, recorder = null, stream = null } = {}) {
    const errors = [];
    const trap = (fn) => {
        try {
            fn();
        } catch (error) {
            errors.push(error);
        }
    };
    if (recognition) {
        trap(() => recognition.abort());
        trap(() => recognition.stop());
    }
    if (recorder && recorder.state !== 'inactive') {
        trap(() => recorder.stop());
    }
    const tracks = stream?.getTracks?.() || [];
    for (const track of tracks) trap(() => track.stop());
    return errors;
}

export function microphoneErrorMessage(error, assistantName) {
    const name = error?.name || '';
    const message = String(error?.message || '');
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /not-allowed|permission/i.test(message)) {
        return `Microphone access is off. Allow it in your settings to talk to ${assistantName}, or type instead.`;
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return `No microphone was found. Type your message to ${assistantName} instead.`;
    }
    if (message) return message;
    return `Couldn't start the microphone${name ? ` (${name})` : ''}. Type your message instead.`;
}

export function transcribeFailureMessage(status, body, assistantName) {
    const message = String(body?.message || body?.detail || '').trim();
    if (status === 401) {
        return message || `Sign in with Google to talk to ${assistantName} on this installed app, or type instead.`;
    }
    if (status === 403) return message || 'This Google account is not authorized for voice transcription.';
    if (status === 413) return message || 'That recording is too long. Try a shorter message.';
    if (status === 503) return message || 'Voice transcription is not available right now. Type your message instead.';
    if (message) return message;
    return `Couldn't turn speech into text${status ? ` (HTTP ${status})` : ''}.`;
}
