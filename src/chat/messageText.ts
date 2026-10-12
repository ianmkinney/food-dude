import { ASSISTANT_NAME, ASSISTANT_PRONUNCIATION } from '../config/assistant';
import { coerceAmpiDisplayText } from '../sous/parseAmpiResponse';

// ElevenLabs v4 audio tags: [warmly], [laughs], [whispering, playful], [pause], [long pause].
// Not Markdown links "[text](url)".
const AUDIO_TAG =
    /\[(?:[a-z][a-z'-]*(?:,\s*[a-z][a-z'-]*){0,3}|long pause|pause)\](?!\()/gi;

const SSML_TAG = /<\/?(?:speak|break|emphasis|prosody|voice|say-as|sub|phoneme|audio|mark)[^>]*>/gi;
const SSML_BREAK = /<break[^>]*\/?>/gi;

export function hasAudioTags(text: string): boolean {
    AUDIO_TAG.lastIndex = 0;
    return AUDIO_TAG.test(text);
}

export function stripAudioTags(text: string): string {
    return text
        .replace(AUDIO_TAG, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([,.!?;:])/g, '$1')
        .replace(/^[ \t]+|[ \t]+$/gm, '')
        .trim();
}

/** Markdown down to plain sentences for a voice: no symbols read aloud, list items end in a pause. */
export function stripMarkdown(text: string): string {
    return text
        .replace(/```[a-z0-9_-]*\n?([\s\S]*?)```/gi, '$1')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
        .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2')
        .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
        .replace(/~~(.*?)~~/g, '$1')
        .split('\n')
        .map((line) => {
            const trimmed = line
                .replace(/^\s{0,3}#{1,6}\s+/, '')
                .replace(/^\s*>\s?/, '')
                .replace(/^\s*[-*+•]\s+/, '')
                .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, '')
                .trim();
            if (!trimmed) return '';
            return /[.!?:;,…)\]]$/.test(trimmed) ? trimmed : `${trimmed}.`;
        })
        .filter(Boolean)
        .join('\n');
}

function respellAssistantName(text: string): string {
    return text.replace(new RegExp(`\\b${ASSISTANT_NAME}\\b`, 'g'), ASSISTANT_PRONUNCIATION.replace(/-/g, ' '));
}

export function stripSsml(text: string): string {
    return text.replace(SSML_TAG, '').replace(SSML_BREAK, '').trim();
}

/** What a reply looks like on screen and to screen readers. */
export function toDisplayText(text: string): string {
    return stripAudioTags(stripSsml(coerceAmpiDisplayText(text)));
}

/** Text for the device / browser voice: no audio tags, no Markdown symbols. */
export function toSpokenText(text: string): string {
    return respellAssistantName(stripMarkdown(stripAudioTags(stripSsml(text))))
        .replace(/\s+/g, ' ')
        .trim();
}

/** Text for ElevenLabs: Markdown symbols removed, audio tags kept for eleven_v3. */
export function toElevenLabsText(text: string): string {
    return respellAssistantName(stripMarkdown(text))
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

/**
 * Splits text into pieces of at most `max` characters, breaking at paragraph,
 * then sentence, then word boundaries, so long replies fit the TTS limit.
 */
export function chunkForSpeech(text: string, max = 800): string[] {
    const chunks: string[] = [];
    let current = '';
    const push = () => {
        if (current.trim()) chunks.push(current.trim());
        current = '';
    };
    const pieces = text.split(/(?<=[.!?…])\s+|\n+/);
    for (const piece of pieces) {
        if (!piece.trim()) continue;
        if (piece.length > max) {
            push();
            let rest = piece;
            while (rest.length > max) {
                const cut = rest.lastIndexOf(' ', max);
                const at = cut > max / 2 ? cut : max;
                chunks.push(rest.slice(0, at).trim());
                rest = rest.slice(at);
            }
            current = rest;
            continue;
        }
        if (current && current.length + 1 + piece.length > max) push();
        current = current ? `${current} ${piece}` : piece;
    }
    push();
    return chunks;
}
