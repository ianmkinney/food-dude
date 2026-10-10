#!/usr/bin/env node
/**
 * Render Sous's scripted onboarding lines to static audio files.
 *
 * Run on a developer machine only. The ElevenLabs key is read from the
 * environment and is never written into the app bundle:
 *
 *   ELEVENLABS_API_KEY=... SOUS_VOICE_ID=... node scripts/generate-sous-audio.mjs
 *
 * Requirements (pending Ian's spend approval):
 * - ElevenLabs Starter plan or higher (commercial use rights).
 * - A Voice Design voice created for Sous (not a clone of a real person).
 * - "Use my data for training" turned off in the ElevenLabs account.
 *
 * Writes assets/audio/sous/<line>.wav (16-bit PCM, 22.05 kHz) for every line in
 * script.json and flips manifest.json "placeholder" to false.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio', 'sous');
const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.SOUS_VOICE_ID;
const model = process.env.SOUS_MODEL_ID || 'eleven_multilingual_v2';
if (!apiKey || !voiceId) {
    console.error('Set ELEVENLABS_API_KEY and SOUS_VOICE_ID.');
    process.exit(1);
}

const SAMPLE_RATE = 22050;

function wavFromPcm(pcm) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(SAMPLE_RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

// "Sous" is pronounced "Soo".
const spoken = (text) => text.replace(/\bSous\b/g, 'Soo');

const { lines } = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'));
for (const [id, text] of Object.entries(lines)) {
    const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_${SAMPLE_RATE}`,
        {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
            body: JSON.stringify({ text: spoken(text), model_id: model }),
        }
    );
    if (!res.ok) {
        console.error(`${id}: HTTP ${res.status} ${await res.text()}`);
        process.exit(1);
    }
    writeFileSync(join(dir, `${id}.wav`), wavFromPcm(Buffer.from(await res.arrayBuffer())));
    console.log(`wrote ${id}.wav`);
}

const manifestPath = join(dir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.placeholder = false;
manifest.note = `Rendered ${new Date().toISOString()} with voice ${voiceId} (${model}).`;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
