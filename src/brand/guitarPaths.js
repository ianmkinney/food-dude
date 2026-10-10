// Simplified AmpliFood guitar for motion. The same shapes are inlined in
// public/index.html for the web startup animation; keep the two in sync.
export const VIEWBOX = '0 0 140 140';
export const GUITAR_ROTATION = 'rotate(12 70 96)';

export const COLORS = {
    ink: '#2A1424',
    tomato: '#E2261F',
    orange: '#F48A38',
    wave: '#EB6A1C',
    leaf: '#4F802F',
    cream: '#FFF4E3',
};

export const WAVES_LEFT = ['M30 74 Q18 96 30 118', 'M17 64 Q1 96 17 128'];
export const WAVES_RIGHT = ['M110 74 Q122 96 110 118', 'M123 64 Q139 96 123 128'];

export const BODY =
    'M70 74 C58 66 44 70 44 84 C44 88 45 91 47 93 C36 100 34 116 44 126 C54 136 86 136 96 126 C106 116 104 100 93 93 C95 91 96 88 96 84 C96 70 82 66 70 74 Z';
export const BODY_LEAVES = 'M50 79 C44 71 48 64 56 66 C56 72 54 76 50 79 Z M90 79 C96 71 92 64 84 66 C84 72 86 76 90 79 Z';
export const NECK = 'M64.5 21 A5 5 0 0 1 69.5 16 H70.5 A5 5 0 0 1 75.5 21 V88 H64.5 Z';
export const HEAD_LEAVES = 'M70 17 C62 5 54 6 52 10 C60 10 65 13 70 17 Z M70 17 C78 5 86 6 88 10 C80 10 75 13 70 17 Z';
export const STRINGS = 'M67 20 V118 M70 20 V118 M73 20 V118';
