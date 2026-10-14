#!/usr/bin/env node
import { decodeAudioBase64, normalizeAudioMime, readTranscriptText } from '../api/_lib/elevenLabsStt.js';
import {
    captureEngine,
    isIosWeb,
    microphoneErrorMessage,
    pickRecorderMime,
    tearDownCapture,
    transcribeFailureMessage,
} from '../src/voice/speechCapture.js';

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

check('chrome ios ua', isIosWeb('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/120.0.0.0 Mobile'));
check('desktop chrome is not ios', !isIosWeb('Mozilla/5.0 (Macintosh) Chrome/120.0.0.0'));

check(
    'installed ios uses the server when recording exists',
    captureEngine({ standaloneIos: true, hasWebSpeech: true, hasRecorder: true }) === 'server'
);
check(
    'installed ios does not use a silent web speech recognizer',
    captureEngine({ standaloneIos: true, hasWebSpeech: true, hasRecorder: false }) === 'none'
);
check(
    'safari tab keeps web speech',
    captureEngine({ standaloneIos: false, hasWebSpeech: true, hasRecorder: true }) === 'web'
);
check(
    'a browser without web speech can record',
    captureEngine({ standaloneIos: false, hasWebSpeech: false, hasRecorder: true }) === 'server'
);

check(
    'prefers mp4',
    pickRecorderMime((type) => type === 'audio/mp4' || type === 'audio/webm') === 'audio/mp4'
);

const calls = [];
const recognition = {
    abort() {
        calls.push('abort');
        throw new Error('InvalidStateError');
    },
    stop() {
        calls.push('stop-rec');
        throw new Error('InvalidStateError');
    },
};
const recorder = {
    state: 'recording',
    stop() {
        calls.push('stop-media');
        this.state = 'inactive';
    },
};
const track = {
    stop() {
        calls.push('track');
    },
};
const errors = tearDownCapture({ recognition, recorder, stream: { getTracks: () => [track] } });
check('stop still runs after abort throws', calls.includes('abort') && calls.includes('stop-rec') && calls.includes('stop-media') && calls.includes('track'), calls.join(','));
check('teardown reports the recognition errors', errors.length === 2);

check(
    'permission errors are readable',
    /Microphone access is off/.test(microphoneErrorMessage({ name: 'NotAllowedError' }, 'Ampi'))
);
check(
    'sign-in failures are readable',
    /Sign in with Google/.test(transcribeFailureMessage(401, {}, 'Ampi'))
);

const wav = Buffer.from('hello-audio');
const decoded = decodeAudioBase64(wav.toString('base64'));
check('audio round trip', decoded.equals(wav));
let rejected = false;
try {
    decodeAudioBase64('@@@');
} catch {
    rejected = true;
}
check('rejects junk audio', rejected);
check('mp4 mime kept', normalizeAudioMime('audio/mp4;codecs=mp4a') === 'audio/mp4');
check('reads transcript text', readTranscriptText({ text: '  add tomatoes  ' }) === 'add tomatoes');

if (failures) process.exit(1);
console.log('speech capture checks passed');
