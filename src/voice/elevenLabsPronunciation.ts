/** Shared ElevenLabs pronunciation dictionary locators for "Ampy" (assistant name). */

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
    return [{ pronunciation_dictionary_id: 'amplifood_ampy', version_id: 'v1' }];
}

export function applyPronunciationLocators<T extends Record<string, unknown>>(body: T): T {
    return {
        ...body,
        pronunciation_dictionary_locators: getElevenLabsPronunciationLocators(),
    };
}
