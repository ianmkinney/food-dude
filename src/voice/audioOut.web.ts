import { VoicePlaybackError } from './voiceErrors';

// iOS Safari only lets an <audio> element play without a tap if that same
// element has already played inside a tap. Replies arrive after an AI call, so
// every speaker tap, send and voice toggle calls unlockAudio() synchronously,
// and all speech reuses this one element. An <audio> element (unlike Web
// Audio) also plays with the ringer switch on silent.

const SILENT_WAV =
    'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA';

let element: HTMLAudioElement | null = null;
let unlocked = false;
let objectUrl: string | null = null;
let finishCurrent: (() => void) | null = null;

function audioElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!element) {
        element = new Audio();
        element.preload = 'auto';
        element.setAttribute('playsinline', '');
    }
    return element;
}

export function isAudioUnlocked(): boolean {
    return unlocked;
}

/** Call synchronously inside a tap handler. */
export function unlockAudio(): void {
    const el = audioElement();
    if (!el || unlocked || finishCurrent) return;
    try {
        el.muted = true;
        el.src = SILENT_WAV;
        const attempt = el.play();
        const done = () => {
            if (el.src === SILENT_WAV) el.pause();
            el.muted = false;
        };
        if (attempt && typeof attempt.then === 'function') {
            attempt.then(() => {
                unlocked = true;
                done();
            }, done);
        } else {
            unlocked = true;
            done();
        }
    } catch {
        el.muted = false;
    }
}

function releaseObjectUrl() {
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
    }
}

export function stopAudio(): void {
    const el = element;
    if (el && finishCurrent) {
        el.pause();
        el.removeAttribute('src');
        el.load();
    }
    const finish = finishCurrent;
    finishCurrent = null;
    releaseObjectUrl();
    finish?.();
}

function playSource(src: string, maxMs: number, ownsUrl = false): Promise<void> {
    const el = audioElement();
    if (!el) {
        if (ownsUrl) URL.revokeObjectURL(src);
        return Promise.reject(new VoicePlaybackError('unsupported', "This browser can't play audio."));
    }
    stopAudio();
    if (ownsUrl) objectUrl = src;
    return new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
            if (timer) clearTimeout(timer);
            el.onended = null;
            el.onerror = null;
            el.onloadedmetadata = null;
        };
        const finish = () => {
            cleanup();
            if (finishCurrent === finish) finishCurrent = null;
            resolve();
        };
        const fail = (error: VoicePlaybackError) => {
            cleanup();
            if (finishCurrent === finish) finishCurrent = null;
            releaseObjectUrl();
            reject(error);
        };
        finishCurrent = finish;
        el.muted = false;
        el.onended = finish;
        el.onerror = () => {
            const code = el.error?.code;
            fail(
                new VoicePlaybackError(
                    'decode',
                    `The browser couldn't play the voice audio${code ? ` (media error ${code})` : ''}.`
                )
            );
        };
        el.onloadedmetadata = () => {
            if (!Number.isFinite(el.duration) || finishCurrent !== finish) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(finish, el.duration * 1000 + 3000);
        };
        el.src = src;
        timer = setTimeout(finish, maxMs);
        const attempt = el.play();
        if (attempt && typeof attempt.catch === 'function') {
            attempt.then(
                () => {
                    unlocked = true;
                },
                (error: Error) => {
                    if (finishCurrent !== finish) return;
                    fail(
                        error?.name === 'NotAllowedError'
                            ? new VoicePlaybackError(
                                  'autoplay',
                                  'Safari blocked the audio because it didn\'t start from a tap. Tap the speaker on a reply to hear it.'
                              )
                            : new VoicePlaybackError('decode', `The browser couldn't play the voice audio (${error?.message || 'unknown error'}).`)
                    );
                }
            );
        }
    });
}

export function playAudioBytes(bytes: ArrayBuffer, mime: string, maxMs: number): Promise<void> {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    return playSource(url, maxMs, true).finally(() => {
        if (objectUrl === url) releaseObjectUrl();
    });
}

export function playAudioUrl(url: string, maxMs: number): Promise<void> {
    return playSource(url, maxMs);
}
