// Premium Sous voice for Plus subscribers, served by the AmpliFood voice proxy
// (streaming TTS, per-user monthly character cap, usage metering; see
// PLATFORM_AI.md). Mirrors PlatformAiClient.synthesizeSpeech from #11 so the
// two merge into one client; until the backend exists this is a stub.

export type PlatformSpeechRequest = { text: string; voice: 'sous' };
export type PlatformSpeechResult = { audioUri: string; charactersUsed: number; charactersLeft: number };

export interface PlatformVoiceClient {
    readonly isLive: boolean;
    synthesizeSpeech(request: PlatformSpeechRequest): Promise<PlatformSpeechResult>;
}

export class PremiumVoiceNotLiveError extends Error {
    constructor() {
        super("The Premium Sous voice isn't switched on yet, so Sous is using your phone's voice.");
        this.name = 'PremiumVoiceNotLiveError';
    }
}

export const stubPlatformVoice: PlatformVoiceClient = {
    isLive: false,
    synthesizeSpeech: async () => {
        throw new PremiumVoiceNotLiveError();
    },
};

export const platformVoice: PlatformVoiceClient = stubPlatformVoice;
