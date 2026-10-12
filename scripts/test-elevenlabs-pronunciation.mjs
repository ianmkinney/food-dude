#!/usr/bin/env node
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

register('./test-support/ts-hooks.mjs', import.meta.url, {
    data: { stubUrl: new URL('./test-support/ampi-stubs.mjs', import.meta.url).href, stubbed: [] },
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const { respellAssistantNameForSpeech, toSpokenText } = await import('../src/chat/messageText.ts');
const {
    ELEVENLABS_PRONUNCIATION_RULES,
    applyPronunciationLocators,
    getElevenLabsPronunciationLocators,
} = await import('../src/voice/elevenLabsPronunciation.ts');
const apiMod = await import(
    pathToFileURL(join(repoRoot, 'api/_lib/elevenLabsPronunciation.js')).href
);

const test = (label, fn) => {
    try {
        fn();
        console.log('ok  ', label);
    } catch (e) {
        console.error('FAIL', label, e.message);
        process.exitCode = 1;
    }
};

test('speech substitution Ampi → Ampy (case-insensitive)', () => {
    assert.equal(respellAssistantNameForSpeech('Ask Ampi or AMPI.'), 'Ask Ampy or Ampy.');
    assert.match(toSpokenText('Hi ampi!'), /^Hi Ampy!/);
});

test('pronunciation rules include alias for Ampi', () => {
    const alias = ELEVENLABS_PRONUNCIATION_RULES.find((r) => r.string_to_replace === 'Ampi');
    assert.equal(alias?.alias, 'Ampy');
});

test('TTS body includes pronunciation_dictionary_locators', () => {
    const body = applyPronunciationLocators({ text: 'Hi Ampy', model_id: 'eleven_v4' });
    assert.ok(Array.isArray(body.pronunciation_dictionary_locators));
    assert.equal(getElevenLabsPronunciationLocators().length, 1);
    assert.equal(apiMod.getElevenLabsPronunciationLocators().length, 1);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('elevenlabs pronunciation checks passed');
