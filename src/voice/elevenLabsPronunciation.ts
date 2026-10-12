/** ElevenLabs TTS: rely on Ampi → Ampy text substitution (no hardcoded dictionary id). */

export const ELEVENLABS_PRONUNCIATION_RULES = [
    {
        type: 'alias' as const,
        alias: 'Ampy',
        string_to_replace: 'Ampi',
        alphabet: 'ipa' as const,
        phoneme: 'ˈæm.pi',
    },
    {
        type: 'alias' as const,
        alias: 'Ampy',
        string_to_replace: 'AMPI',
        alphabet: 'ipa' as const,
        phoneme: 'ˈæm.pi',
    },
];

export function getElevenLabsPronunciationLocators() {
    return [];
}

export function applyPronunciationLocators<T extends Record<string, unknown>>(body: T): T {
    return body;
}
