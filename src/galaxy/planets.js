/**
 * The planet registry: the single source of truth for what worlds exist in
 * Galaxy Health, where they sit in the system, and how they look.
 *
 * Two rules matter here:
 *
 * 1. `id` is permanent. It is written into every row of `signals`,
 *    `domain_tables` and `planets`, so renaming a world must never change it.
 * 2. `defaultName` is only a starting point. The name the user actually sees
 *    lives in the `planets` table and is editable from the Bridge. Read it
 *    from `GalaxyContext`, never from here.
 *
 * Distances and radii are in world units, consumed by `engine/scene.js` and
 * projected to screen space at render time. They are tuned so the whole system
 * fits a phone viewport without the outer orbit clipping.
 */

export const PLANET_IDS = {
    GALLEY: 'galley',
    ATLAS: 'atlas',
    LUMEN: 'lumen',
    OBSERVATORY: 'observatory',
};

/**
 * The star at the centre. Not a planet — it has no screen and no data — but it
 * anchors every orbit and drives the scene's key light.
 */
export const STAR = {
    id: 'helios',
    defaultName: 'Helios',
    radius: 0.72,
    colors: {
        core: '#FFF8E1',
        mid: '#FFD066',
        edge: '#FF9A2E',
        glow: '#FFC24D',
    },
    coronaScale: 2.6,
};

/**
 * Ordered outward from the star. This order is also the seed order for the
 * `planets` table, so `sort_order` matches the physical layout of the system.
 */
export const PLANETS = [
    {
        id: PLANET_IDS.GALLEY,
        defaultName: 'Galley',
        role: 'Food, pantry, and the week ahead',
        blurb: 'Recipes, meal plans, and what is actually in the cupboard.',
        icon: 'restaurant',
        route: 'GalleyTabs',
        orbitRadius: 1.55,
        orbitPeriod: 42,
        phase: 0.15,
        inclination: 0.06,
        radius: 0.34,
        spin: 0.35,
        ring: null,
        colors: {
            core: '#FFE2B0',
            mid: '#F5A623',
            edge: '#7A4110',
            glow: '#F5A623',
        },
    },
    {
        id: PLANET_IDS.ATLAS,
        defaultName: 'Atlas',
        role: 'Training, load, and movement',
        blurb: 'Sessions, sets, and how hard the week has been.',
        icon: 'barbell',
        route: 'Atlas',
        orbitRadius: 2.35,
        orbitPeriod: 66,
        phase: 2.1,
        inclination: -0.04,
        radius: 0.3,
        spin: 0.28,
        ring: null,
        colors: {
            core: '#FFC3B0',
            mid: '#FF6B4A',
            edge: '#6E2114',
            glow: '#FF6B4A',
        },
    },
    {
        id: PLANET_IDS.LUMEN,
        defaultName: 'Lumen',
        role: 'Mood, sleep, and focus',
        blurb: 'How you slept, how you feel, and where attention went.',
        icon: 'sparkles',
        route: 'Lumen',
        orbitRadius: 3.15,
        orbitPeriod: 92,
        phase: 3.9,
        inclination: 0.09,
        radius: 0.32,
        spin: 0.2,
        ring: null,
        colors: {
            core: '#DDCEFF',
            mid: '#8B6BF2',
            edge: '#2C1C63',
            glow: '#8B6BF2',
        },
    },
    {
        id: PLANET_IDS.OBSERVATORY,
        defaultName: 'Observatory',
        role: 'Labs and long-range markers',
        blurb: 'Blood panels and the numbers that move slowly.',
        icon: 'telescope',
        route: 'Observatory',
        orbitRadius: 4.05,
        orbitPeriod: 130,
        phase: 5.4,
        inclination: -0.11,
        // Deliberately the smallest body: a cold, distant outpost. The ring
        // keeps it readable at this size.
        radius: 0.12,
        spin: 0.14,
        ring: {
            innerScale: 1.9,
            outerScale: 3.1,
            tilt: 0.42,
            color: '#7FD6F5',
            opacity: 0.5,
        },
        colors: {
            core: '#D6F2FF',
            mid: '#5AC8F5',
            edge: '#0F3E58',
            glow: '#5AC8F5',
        },
    },
];

export const PLANET_BY_ID = PLANETS.reduce((map, planet) => {
    map[planet.id] = planet;
    return map;
}, {});

export const PLANET_ORDER = PLANETS.map((planet) => planet.id);

/**
 * The name a world falls back to when the user has never renamed it, or when
 * `planets` is unreadable. Returns the id itself for an unknown planet so a
 * stale signal row can still render something truthful.
 */
export function getDefaultName(id) {
    const planet = PLANET_BY_ID[id];
    return planet ? planet.defaultName : String(id);
}

export function getPlanet(id) {
    return PLANET_BY_ID[id] || null;
}

export function getPlanetRoute(id) {
    const planet = PLANET_BY_ID[id];
    return planet ? planet.route : null;
}

export function getPlanetColors(id) {
    const planet = PLANET_BY_ID[id];
    return planet ? planet.colors : STAR.colors;
}

export default PLANETS;
