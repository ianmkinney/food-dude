/** Max continuous listen before auto-stop and send (safety cap). */
export const MAX_SPEECH_INPUT_MS = 120_000;

export function appendTranscriptChunk(accumulated, chunk) {
    const a = accumulated.trim();
    const b = chunk.trim();
    if (!b) return a;
    if (!a) return b;
    return `${a} ${b}`;
}

export function buildDisplayTranscript(accumulated, sessionText) {
    return appendTranscriptChunk(accumulated, sessionText);
}

export function finalizeTranscript(accumulated, sessionText) {
    return buildDisplayTranscript(accumulated, sessionText);
}

/** When recognition ends without the user tapping stop (common on iOS Safari), start again. */
export function shouldRestartRecognitionAfterEnd(userRequestedStop) {
    return !userRequestedStop;
}

export function commitSessionToAccumulated(accumulated, sessionText) {
    return finalizeTranscript(accumulated, sessionText);
}

export function formatRecordingElapsed(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
