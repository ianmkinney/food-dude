import { generateText } from '../services/aiClient';
import { stripSsml, toElevenLabsText } from '../chat/messageText';
import type { VoiceExpressiveness } from './voiceSettings';

const ENHANCE_PROMPT = `You prepare cooking-assistant copy for ElevenLabs v4 text-to-speech.

Rules:
- Do NOT change, add, or remove any words. Only add ElevenLabs audio tags in square brackets.
- Use 1–3 contextually appropriate tags per sentence group (e.g. [warmly], [excited], [laughs], [curious], [sighs], [pause], [long pause], [whispering, playful]).
- Use punctuation and ellipses for pacing. No SSML, no <break>, no HTML.
- Tags must sit immediately before the words they colour.
- Return ONLY the enhanced text, no JSON or commentary.`;

export async function enhanceTextForSpeech(
    displayText: string,
    level: VoiceExpressiveness
): Promise<string> {
    const base = stripSsml(toElevenLabsText(displayText));
    if (!base.trim() || level === 'natural') return base;
    const tagHint =
        level === 'very_expressive'
            ? 'Use up to three tags per sentence group where it feels natural.'
            : 'Use one or two tags per sentence group where it feels natural.';
    try {
        const enhanced = await generateText(
            `${ENHANCE_PROMPT}\n${tagHint}\n\nText:\n${base}`,
            { feature: 'speech' }
        );
        const out = stripSsml(String(enhanced || '').trim());
        if (!out || out.length < base.length * 0.5) return base;
        return out;
    } catch {
        return base;
    }
}
