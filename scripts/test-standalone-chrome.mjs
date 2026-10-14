#!/usr/bin/env node
import { addRecipeSurfaces } from '../src/screens/addRecipeAppearance.js';
import {
    isStandaloneDisplay,
    standaloneShellHeight,
    standaloneTopInset,
} from '../src/layout/standaloneChrome.js';

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

check('navigator.standalone counts', isStandaloneDisplay(true, () => false));
check('display-mode standalone counts', isStandaloneDisplay(false, (mode) => mode === 'standalone'));
check('display-mode fullscreen counts', isStandaloneDisplay(false, (mode) => mode === 'fullscreen'));
check('display-mode minimal-ui counts', isStandaloneDisplay(undefined, (mode) => mode === 'minimal-ui'));
check('a browser tab is not standalone', !isStandaloneDisplay(false, () => false));

const short = standaloneShellHeight({
    viewportHeight: 744,
    largeHeight: 844,
    screenHeight: 844,
    innerHeight: 744,
});
check('short visual viewport does not shrink the shell', short === 844, String(short));

const keyboard = standaloneShellHeight({
    viewportHeight: 508,
    largeHeight: 844,
    screenHeight: 844,
    innerHeight: 844,
});
check('a real keyboard uses the visual viewport', keyboard === 508, String(keyboard));

const monitor = standaloneShellHeight({
    viewportHeight: 800,
    largeHeight: 800,
    screenHeight: 1440,
    innerHeight: 800,
});
check('a desktop monitor height is ignored', monitor === 800, String(monitor));

check('chrome reports 0 top inset on a tall phone', standaloneTopInset(0, 852) === 59);
check('notch phone fallback', standaloneTopInset(0, 844) === 47);
check('small phone fallback', standaloneTopInset(0, 667) === 20);
check('a real inset is kept', standaloneTopInset(59, 852) === 59);
check('unknown screen height still clears a status bar', standaloneTopInset(0, 0) === 47);

const theme = {
    isDark: true,
    colors: {
        surface: '#1E1A1C',
        background: '#141012',
        border: 'rgba(255,244,227,0.12)',
        text: { primary: '#FFF4E3', secondary: '#DDCFC4', tertiary: '#A8988F' },
    },
    primary: {
        50: '#FFF4EA',
        100: '#FFE5CC',
        200: '#FDC897',
        300: '#F9A862',
        400: '#F48A38',
        600: '#CC5512',
        700: '#A6430F',
        800: '#7E340F',
        900: '#57250C',
    },
};
const dark = addRecipeSurfaces(theme);
check('dark link card is a surface, not cream', dark.linkCard.backgroundColor === '#1E1A1C');
check('dark hint is secondary text', dark.linkHint === '#DDCFC4');
check('dark title is primary text', dark.linkTitle === '#FFF4E3');
check('dark input sits on the page background', dark.inputRow.backgroundColor === '#141012');
const light = addRecipeSurfaces({ ...theme, isDark: false });
check('light link card stays cream', light.linkCard.backgroundColor === '#FFF4EA');
check('light title stays the deep orange', light.linkTitle === '#7E340F');

if (failures) process.exit(1);
console.log('standalone chrome checks passed');
