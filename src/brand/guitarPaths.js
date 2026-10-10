/**
 * Vector food-guitar used by the startup splash, the Ampi avatar and empty
 * states. public/index.html inlines the same `d` strings for the pre-JS
 * splash; scripts/web-postexport.js fails the build if they drift apart.
 *
 * Drawn upright in a `-8 0 136 150` box; GUITAR_TILT leans the instrument.
 */
module.exports = {
    VIEW_BOX: '-8 0 136 150',
    GUITAR_TILT: 'rotate(14 60 80)',
    COLORS: {
        ink: '#2A1424',
        tomato: '#E2261F',
        crust: '#F48A38',
        crumb: '#FDC897',
        leaf: '#4F802F',
        cream: '#FFF8EC',
        wave: '#EB6A1C',
    },
    body: 'M60 64C48 60 34 62 33 76C32 86 39 90 37 98C34 110 40 132 60 134C80 132 86 110 83 98C81 90 88 86 87 76C86 62 72 60 60 64Z',
    neck: 'M55 70L55 18Q60 9 65 18L65 70Z',
    neckScores: 'M57 60L63 56M57 48L63 44M57 36L63 32M57 25L63 22',
    leaves: 'M45 67C34 60 34 50 47 54C51 58 50 63 45 67ZM75 67C86 60 86 50 73 54C69 58 70 63 75 67ZM49 134C41 126 48 120 58 128ZM71 134C79 126 72 120 62 128ZM60 12C54 2 60 0 63 6Z',
    pegs: [
        [51, 22],
        [51, 31],
        [69, 22],
        [69, 31],
    ],
    strings: ['M57 114L57 18', 'M60 114L60 16', 'M63 114L63 18'],
    pickups: [
        [50, 84, 20, 5],
        [50, 94, 20, 5],
    ],
    bridge: [51, 110, 18, 5],
    knob: [75, 116, 4],
    wavesLeft: ['M20 70C11 82 11 104 20 116', 'M9 60C-4 80 -4 106 9 126'],
    wavesRight: ['M100 70C109 82 109 104 100 116', 'M111 60C124 80 124 106 111 126'],
};
