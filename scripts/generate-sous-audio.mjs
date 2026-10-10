#!/usr/bin/env node
/**
 * Render the Premium Sous voice preview clip (the only bundled premium audio).
 *
 * Run on a developer machine only; the key is read from the environment and is
 * never written into the app:
 *
 *   ELEVENLABS_API_KEY=... SOUS_VOICE_ID=... node scripts/generate-sous-audio.mjs
 *
 * Pending Ian's spend approval: ElevenLabs Starter plan or higher (commercial
 * rights), a Voice Design voice for Sous (not a clone of a real person), and
 * "use my data for training" turned off.
 *
 * Writes assets/audio/premium-voice/preview.wav (16-bit PCM, 22.05 kHz) from the
 * caption in preview.json and sets "placeholder": false.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio', 'premium-voice');
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

const metaPath = join(dir, 'preview.json');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
// "Sous" is pronounced "Soo".
const text = meta.caption.replace(/\bSous\b/g, 'Soo');

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_${SAMPLE_RATE}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: model }),
});
if (!res.ok) {
    console.error(`HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
}
writeFileSync(join(dir, 'preview.wav'), wavFromPcm(Buffer.from(await res.arrayBuffer())));
meta.placeholder = false;
meta.note = `Rendered ${new Date().toISOString()} with voice ${voiceId} (${model}).`;
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
console.log('wrote preview.wav');
