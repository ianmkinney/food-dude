#!/usr/bin/env node
import {
    appendTranscriptChunk,
    commitSessionToAccumulated,
    finalizeTranscript,
    shouldRestartRecognitionAfterEnd,
} from '../src/voice/speechInputSession.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

let acc = '';
acc = appendTranscriptChunk(acc, 'hello');
acc = appendTranscriptChunk(acc, 'world');
check('append chunks', acc === 'hello world');

acc = commitSessionToAccumulated(acc, 'more speech');
check('commit session on safari restart', acc === 'hello world more speech');

acc = '';
acc = commitSessionToAccumulated(acc, 'first pause');
acc = commitSessionToAccumulated(acc, 'second pause');
check('double restart accumulates', acc === 'first pause second pause');

check('finalize on stop merges session', finalizeTranscript('line one', 'line two') === 'line one line two');
check('restart when user has not stopped', shouldRestartRecognitionAfterEnd(false) === true);
check('no restart after user stop', shouldRestartRecognitionAfterEnd(true) === false);

if (failures) process.exit(1);
console.log('speech input session checks passed');
