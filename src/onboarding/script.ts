import script from '../../assets/audio/sous/script.json';
import manifest from '../../assets/audio/sous/manifest.json';

// Scripted onboarding lines. The same text is the caption, so every spoken
// line is also on screen. Audio is pre-rendered (no ElevenLabs key in the app);
// while the files are placeholders the on-device voice reads the line instead.

export type LineId = keyof typeof script.lines;

export const LINES = script.lines as Record<LineId, string>;

export const AUDIO_IS_PLACEHOLDER = manifest.placeholder;

// Static requires so Metro bundles every file.
export const AUDIO: Record<LineId, number> = {
    intro: require('../../assets/audio/sous/intro.wav'),
    agree: require('../../assets/audio/sous/agree.wav'),
    allergies: require('../../assets/audio/sous/allergies.wav'),
    consent: require('../../assets/audio/sous/consent.wav'),
    profile: require('../../assets/audio/sous/profile.wav'),
    recipes: require('../../assets/audio/sous/recipes.wav'),
    tour_recipes: require('../../assets/audio/sous/tour_recipes.wav'),
    tour_plan: require('../../assets/audio/sous/tour_plan.wav'),
    tour_grocery: require('../../assets/audio/sous/tour_grocery.wav'),
    tour_pantry: require('../../assets/audio/sous/tour_pantry.wav'),
    tour_sous: require('../../assets/audio/sous/tour_sous.wav'),
    skipped: require('../../assets/audio/sous/skipped.wav'),
};
