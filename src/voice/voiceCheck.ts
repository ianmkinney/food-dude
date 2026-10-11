import { ASSISTANT_NAME } from '../config/assistant';
import { toElevenLabsText } from '../chat/messageText';
import { playAudioBytes } from './audioOut';
import { stopElevenLabsPlayback } from './elevenLabsPlayback';
import { fetchOwnerVoiceSession, listPlatformElevenLabsVoices, synthesizePlatformTts } from './platformElevenLabsClient';
import { getPlatformElevenLabsConfig } from './platformElevenLabsSettings';

export type VoiceCheckStep = { label: string; level: 'ok' | 'warn' | 'fail'; detail: string };

const SAMPLE = `[warmly] Hi, I'm ${ASSISTANT_NAME}. Your ElevenLabs voice is working.`;

/**
 * Walks the owner ElevenLabs path end to end: sign-in, server session, voice
 * list, speech synthesis, then playback on this device. Call primeSpeechOnWeb()
 * synchronously in the tap that starts it, or iOS Safari will block playback.
 */
export async function runOwnerVoiceCheck(onProgress?: (steps: VoiceCheckStep[]) => void): Promise<VoiceCheckStep[]> {
    const steps: VoiceCheckStep[] = [];
    const add = (step: VoiceCheckStep) => {
        steps.push(step);
        onProgress?.([...steps]);
        return step.level !== 'fail';
    };

    const session = await fetchOwnerVoiceSession();
    if (!add(session.signedIn
        ? { label: 'Signed in', level: 'ok', detail: 'Google sign-in found on this device.' }
        : { label: 'Signed in', level: 'fail', detail: 'Sign in with Google above first.' })) return steps;

    if (session.error) {
        add({ label: 'Server session', level: 'fail', detail: session.error });
        return steps;
    }
    if (!session.platformAiAllowed) {
        add({ label: 'Server session', level: 'fail', detail: "This Google account isn't on the server allowlist (ALLOWED_EMAILS / OWNER_EMAIL)." });
        return steps;
    }
    if (!session.elevenlabsAvailable) {
        add({
            label: 'Server session',
            level: 'fail',
            detail: 'The server reports no ElevenLabs key. Set ELEVENLABS_API_KEY for this environment in Vercel and redeploy (env changes only apply to new deployments).',
        });
        return steps;
    }
    add({ label: 'Server session', level: 'ok', detail: 'Allowlisted, and the server has an ElevenLabs key.' });

    let voices;
    try {
        voices = await listPlatformElevenLabsVoices();
    } catch (error) {
        add({ label: 'Voice list', level: 'fail', detail: (error as Error).message });
        return steps;
    }
    if (!add(voices.length
        ? { label: 'Voice list', level: 'ok', detail: `${voices.length} voice${voices.length === 1 ? '' : 's'} in the owner account.` }
        : { label: 'Voice list', level: 'fail', detail: 'The owner ElevenLabs account has no voices.' })) return steps;

    const config = await getPlatformElevenLabsConfig();
    const voice = voices.find((v) => v.voice_id === config.voiceId) || voices[0];
    if (!config.enabled || !config.voiceId) {
        add({
            label: 'Voice settings',
            level: 'warn',
            detail: config.enabled
                ? `No voice picked yet; testing with ${voice.name}. Pick one below so replies use it.`
                : `"Use owner ElevenLabs voice" is off, so replies use the built-in voice. Testing with ${voice.name}.`,
        });
    } else {
        add({ label: 'Voice settings', level: 'ok', detail: `Replies use ${voice.name}.` });
    }

    let audio;
    try {
        audio = await synthesizePlatformTts(toElevenLabsText(SAMPLE), voice.voice_id);
    } catch (error) {
        add({ label: 'Speech audio', level: 'fail', detail: (error as Error).message });
        return steps;
    }
    add({
        label: 'Speech audio',
        level: 'ok',
        detail: `${Math.round(audio.bytes.byteLength / 1024)} KB of ${audio.mime}${audio.model ? ` from ${audio.model}` : ''}.`,
    });

    try {
        stopElevenLabsPlayback();
        await playAudioBytes(audio.bytes, audio.mime, 20_000);
        add({ label: 'Playback', level: 'ok', detail: "Played on this device. If you heard nothing, turn the volume up." });
    } catch (error) {
        add({ label: 'Playback', level: 'fail', detail: (error as Error).message });
    }
    return steps;
}
