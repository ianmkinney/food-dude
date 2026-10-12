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
const { fetchElevenLabsTts } = await import(
    pathToFileURL(join(repoRoot, 'api/_lib/elevenLabs.js')).href
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

test('TTS body does not hardcode pronunciation_dictionary_locators', () => {
    const body = applyPronunciationLocators({ text: 'Hi Ampi', model_id: 'eleven_v4' });
    assert.equal(body.pronunciation_dictionary_locators, undefined);
    assert.equal(getElevenLabsPronunciationLocators().length, 0);
    assert.equal(apiMod.getOptionalPronunciationLocators().length, 0);
});

test('server buildElevenLabsTtsBody respells Ampi in text', () => {
    const built = apiMod.buildElevenLabsTtsBody({ text: 'Hello Ampi', model_id: 'eleven_v4' });
    assert.equal(built.text, 'Hello Ampy');
    assert.equal(built.pronunciation_dictionary_locators, undefined);
});

test('optional locators only from env', () => {
    const prevId = process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID;
    const prevVer = process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID;
    process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID = 'dict_abc';
    process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID = 'ver_1';
    assert.deepEqual(apiMod.getOptionalPronunciationLocators(), [
        { pronunciation_dictionary_id: 'dict_abc', version_id: 'ver_1' },
    ]);
    if (prevId === undefined) delete process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID;
    else process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID = prevId;
    if (prevVer === undefined) delete process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID;
    else process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID = prevVer;
});

await (async () => {
    process.env.ELEVENLABS_API_KEY = 'xi-test-key';
    process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID = 'amplifood_ampy';
    process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID = 'v1';
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        calls.push(body);
        if (body.pronunciation_dictionary_locators?.length) {
            return new Response(
                JSON.stringify({
                    detail: {
                        status: 'pronunciation_dictionary_not_found',
                        message: 'Pronunciation dictionary amplifood_ampy (version: v1) not found',
                    },
                }),
                { status: 404 },
            );
        }
        return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
        });
    };
    try {
        const buf = await fetchElevenLabsTts({
            voiceId: 'voice_12345678',
            text: 'Hi Ampi',
            modelId: 'eleven_v4',
        });
        assert.ok(buf.length > 0);
        assert.equal(calls.length, 2);
        assert.ok(calls[0].pronunciation_dictionary_locators?.length);
        assert.equal(calls[0].text, 'Hi Ampy');
        assert.equal(calls[1].pronunciation_dictionary_locators, undefined);
        assert.equal(calls[1].text, 'Hi Ampy');
        console.log('ok  ', 'fetchElevenLabsTts retries without locators on dictionary 404');
    } finally {
        globalThis.fetch = realFetch;
        delete process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID;
        delete process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID;
        delete process.env.ELEVENLABS_API_KEY;
    }
})();

if (process.exitCode) process.exit(process.exitCode);
console.log('elevenlabs pronunciation checks passed');
