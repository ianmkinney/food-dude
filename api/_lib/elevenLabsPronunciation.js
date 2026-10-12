/**
 * ElevenLabs pronunciation dictionary locators for assistant name "Ampy".
 * Text is pre-substituted to "Ampy" in app code; dictionary reinforces pronunciation.
 */
export const ELEVENLABS_PRONUNCIATION_RULES = [
    {
        type: 'alias',
        alias: 'Ampy',
        string_to_replace: 'Ampi',
        alphabet: 'ipa',
        phoneme: 'ˈæm.pi',
    },
    {
        type: 'alias',
        alias: 'Ampy',
        string_to_replace: 'AMPI',
        alphabet: 'ipa',
        phoneme: 'ˈæm.pi',
    },
];

export function getElevenLabsPronunciationLocators() {
    return [{ pronunciation_dictionary_id: 'amplifood_ampy', version_id: 'v1' }];
}

export function applyPronunciationLocators(body) {
    return {
        ...body,
        pronunciation_dictionary_locators: getElevenLabsPronunciationLocators(),
    };
}
