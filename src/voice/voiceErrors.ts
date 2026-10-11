export type VoicePlaybackReason = 'autoplay' | 'decode' | 'unsupported';

export class VoicePlaybackError extends Error {
    readonly reason: VoicePlaybackReason;

    constructor(reason: VoicePlaybackReason, message: string) {
        super(message);
        this.name = 'VoicePlaybackError';
        this.reason = reason;
    }
}
