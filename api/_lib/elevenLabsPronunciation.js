/**
 * ElevenLabs TTS: spell assistant name "Ampy" in text (no hardcoded dictionary id).
 * Optional locators only when ELEVENLABS_PRONUNCIATION_DICTIONARY_ID + VERSION env are set.
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

const ASSISTANT_NAME = 'Ampi';
const ASSISTANT_PRONUNCIATION = 'Ampy';

/** Whole-word Ampi → Ampy for TTS (display name unchanged elsewhere). */
export function respellAssistantNameForSpeech(text) {
    return String(text || '').replace(new RegExp(`\\b${ASSISTANT_NAME}\\b`, 'gi'), ASSISTANT_PRONUNCIATION);
}

export function getOptionalPronunciationLocators() {
    const id = String(process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID || '').trim();
    const version = String(process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID || '').trim();
    if (!id || !version) return [];
    return [{ pronunciation_dictionary_id: id, version_id: version }];
}

/** @deprecated Use getOptionalPronunciationLocators — no hardcoded dictionary. */
export function getElevenLabsPronunciationLocators() {
    return getOptionalPronunciationLocators();
}

export function isPronunciationDictionaryNotFoundError(status, message) {
    if (status !== 404) return false;
    const m = String(message || '').toLowerCase();
    return m.includes('pronunciation dictionary') || m.includes('pronunciation_dictionary');
}

/**
 * @param {object} body
 * @param {{ includeLocators?: boolean }} [opts]
 */
export function buildElevenLabsTtsBody(body, opts = {}) {
    const includeLocators = opts.includeLocators !== false;
    const out = {
        ...body,
        text: respellAssistantNameForSpeech(body.text),
    };
    const locators = includeLocators ? getOptionalPronunciationLocators() : [];
    if (locators.length) {
        out.pronunciation_dictionary_locators = locators;
    } else if ('pronunciation_dictionary_locators' in out) {
        delete out.pronunciation_dictionary_locators;
    }
    return out;
}

/** @deprecated Prefer buildElevenLabsTtsBody */
export function applyPronunciationLocators(body) {
    return buildElevenLabsTtsBody(body);
}
