/**
 * The planet registry: worlds in AmpliFood (cooking / Galley only at launch).
 */

export const PLANET_IDS = {
    GALLEY: 'galley',
};

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
            core: '#FFD9A8',
            mid: '#EB6A1C',
            edge: '#7E340F',
            glow: '#EB6A1C',
        },
    },
];

export const PLANET_BY_ID = PLANETS.reduce((map, planet) => {
    map[planet.id] = planet;
    return map;
}, {});

export const PLANET_ORDER = PLANETS.map((planet) => planet.id);

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
