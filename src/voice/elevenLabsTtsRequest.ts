import { hasAudioTags, stripAudioTags, stripSsml, toElevenLabsText } from '../chat/messageText';
import { enhanceTextForSpeech } from './enhanceForSpeech';
import { getVoiceSettings, voiceStabilityForExpressiveness } from './voiceSettings';
import { applyPronunciationLocators } from './elevenLabsPronunciation';

export const ELEVEN_V4 = 'eleven_v4';
export const ELEVEN_V4_TURBO = 'eleven_v4_turbo';
export const ELEVEN_V3 = 'eleven_v3';
export const ELEVEN_FLASH = 'eleven_flash_v2_5';

export const ELEVEN_MODEL_CHAIN = [ELEVEN_V4, ELEVEN_V4_TURBO, ELEVEN_V3, ELEVEN_FLASH];

export type ElevenTtsBody = {
    text: string;
    model_id: string;
    voice_settings?: {
        stability: number;
        similarity_boost: number;
        style?: number;
        use_speaker_boost?: boolean;
    };
    pronunciation_dictionary_locators?: { pronunciation_dictionary_id: string; version_id: string }[];
};

export async function prepareElevenLabsSpeechText(displayText: string): Promise<string> {
    const settings = await getVoiceSettings();
    const plain = stripSsml(toElevenLabsText(displayText));
    return enhanceTextForSpeech(plain, settings.expressiveness);
}

export async function buildElevenLabsTtsBodyForUser(text: string, modelId: string): Promise<ElevenTtsBody> {
    const { expressiveness } = await getVoiceSettings();
    return applyPronunciationLocators({
        text: stripSsml(text),
        model_id: modelId,
        voice_settings: {
            stability: voiceStabilityForExpressiveness(expressiveness),
            similarity_boost: 0.72,
            style: expressiveness === 'very_expressive' ? 0.55 : 0.4,
            use_speaker_boost: true,
        },
    });
}

export function pickElevenLabsModelChain(text: string, preferTurbo = false): string[] {
    const chain = [...ELEVEN_MODEL_CHAIN];
    if (preferTurbo) {
        return [ELEVEN_V4_TURBO, ELEVEN_V4, ELEVEN_V3, ELEVEN_FLASH];
    }
    if (!hasAudioTags(text)) {
        return [ELEVEN_V4, ELEVEN_FLASH, ELEVEN_V3];
    }
    return chain;
}
