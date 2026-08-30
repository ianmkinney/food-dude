/**
 * Signals are the visible consequence of one planet learning something from
 * another. Every signal kind declares its route through the system up front,
 * so a caller only has to name the kind and hand over a payload — the source,
 * target and craft come from here.
 *
 * `craft` picks how the flight renders on the Bridge:
 *   freighter — slow, heavy, carries bulk (food and supplies)
 *   probe     — brisk, instrumented (measurements and totals)
 *   beam      — near-instant pulse of light (states and signals)
 */

import { PLANET_IDS } from './planets';

export const SIGNAL_KINDS = {
    MEAL_PLANNED: 'meal_planned',
    MEAL_COOKED: 'meal_cooked',
    PANTRY_STOCKED: 'pantry_stocked',
    WORKOUT_BURN: 'workout_burn',
    TRAINING_LOAD: 'training_load',
    MOOD_STATE: 'mood_state',
    SLEEP_DEBT: 'sleep_debt',
    FOCUS_BLOCK: 'focus_block',
    LAB_MARKERS: 'lab_markers',
};

export const CRAFT = {
    FREIGHTER: 'freighter',
    PROBE: 'probe',
    BEAM: 'beam',
};

const number = (value, fallback = null) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Keyed by signal kind. `describe` turns a payload into one line for the
 * Bridge transmission log, and must survive a null or half-built payload —
 * these rows can outlive the code that wrote them.
 */
export const SIGNAL_MANIFEST = {
    [SIGNAL_KINDS.MEAL_PLANNED]: {
        kind: SIGNAL_KINDS.MEAL_PLANNED,
        source: PLANET_IDS.GALLEY,
        target: PLANET_IDS.ATLAS,
        craft: CRAFT.FREIGHTER,
        label: 'Fuel plan',
        describe: (payload) => {
            const name = payload && payload.name;
            return name ? `${name} planned as fuel` : 'A meal was added to the plan';
        },
    },

    [SIGNAL_KINDS.MEAL_COOKED]: {
        kind: SIGNAL_KINDS.MEAL_COOKED,
        source: PLANET_IDS.GALLEY,
        target: PLANET_IDS.OBSERVATORY,
        craft: CRAFT.FREIGHTER,
        label: 'Intake logged',
        describe: (payload) => {
            const name = payload && payload.name;
            return name ? `${name} cooked and logged` : 'A meal was cooked';
        },
    },

    [SIGNAL_KINDS.PANTRY_STOCKED]: {
        kind: SIGNAL_KINDS.PANTRY_STOCKED,
        source: PLANET_IDS.GALLEY,
        target: PLANET_IDS.LUMEN,
        craft: CRAFT.FREIGHTER,
        label: 'Supplies',
        describe: (payload) => {
            const name = payload && payload.name;
            return name ? `${name} stocked in the pantry` : 'Supplies reached the pantry';
        },
    },

    [SIGNAL_KINDS.WORKOUT_BURN]: {
        kind: SIGNAL_KINDS.WORKOUT_BURN,
        source: PLANET_IDS.ATLAS,
        target: PLANET_IDS.GALLEY,
        craft: CRAFT.PROBE,
        label: 'Burn',
        describe: (payload) => {
            const volume = number(payload && payload.volume);
            const name = (payload && payload.name) || 'A session';
            if (volume === null || volume <= 0) return `${name} logged`;
            return `${name}: ${Math.round(volume).toLocaleString()} lb moved`;
        },
    },

    [SIGNAL_KINDS.TRAINING_LOAD]: {
        kind: SIGNAL_KINDS.TRAINING_LOAD,
        source: PLANET_IDS.ATLAS,
        target: PLANET_IDS.LUMEN,
        craft: CRAFT.PROBE,
        label: 'Training load',
        describe: (payload) => {
            const strain = number(payload && payload.strain);
            return strain === null
                ? 'Training load reported'
                : `Effort logged at ${strain} of 5`;
        },
    },

    [SIGNAL_KINDS.MOOD_STATE]: {
        kind: SIGNAL_KINDS.MOOD_STATE,
        source: PLANET_IDS.LUMEN,
        target: PLANET_IDS.GALLEY,
        craft: CRAFT.BEAM,
        label: 'Mood',
        describe: (payload) => {
            const mood = number(payload && payload.mood);
            return mood === null ? 'Mood recorded' : `Mood at ${mood} of 5`;
        },
    },

    [SIGNAL_KINDS.SLEEP_DEBT]: {
        kind: SIGNAL_KINDS.SLEEP_DEBT,
        source: PLANET_IDS.LUMEN,
        target: PLANET_IDS.ATLAS,
        craft: CRAFT.BEAM,
        label: 'Sleep',
        describe: (payload) => {
            const hours = number(payload && payload.hours);
            if (hours === null) return 'Sleep recorded';
            const rounded = Math.round(hours * 10) / 10;
            return `${rounded}h slept`;
        },
    },

    [SIGNAL_KINDS.FOCUS_BLOCK]: {
        kind: SIGNAL_KINDS.FOCUS_BLOCK,
        source: PLANET_IDS.LUMEN,
        target: PLANET_IDS.OBSERVATORY,
        craft: CRAFT.BEAM,
        label: 'Focus',
        describe: (payload) => {
            const minutes = number(payload && payload.minutes);
            return minutes === null
                ? 'A focus block closed'
                : `${Math.round(minutes)} min of focus`;
        },
    },

    [SIGNAL_KINDS.LAB_MARKERS]: {
        kind: SIGNAL_KINDS.LAB_MARKERS,
        source: PLANET_IDS.OBSERVATORY,
        target: PLANET_IDS.GALLEY,
        craft: CRAFT.PROBE,
        label: 'Markers',
        describe: (payload) => {
            const count = number(payload && payload.markerCount, 0);
            const out = number(payload && payload.outOfRange, 0);
            const base = `${count} marker${count === 1 ? '' : 's'} filed`;
            return out > 0 ? `${base}, ${out} out of range` : base;
        },
    },
};

export function getManifest(kind) {
    return SIGNAL_MANIFEST[kind] || null;
}

/**
 * Safe for arbitrary rows read back out of SQLite, including kinds this build
 * no longer knows about.
 */
export function describeSignal(kind, payload) {
    const manifest = SIGNAL_MANIFEST[kind];
    if (!manifest) return 'Signal received';
    try {
        return manifest.describe(payload);
    } catch {
        return manifest.label;
    }
}

export default SIGNAL_MANIFEST;
