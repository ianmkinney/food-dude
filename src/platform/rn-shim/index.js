/**
 * App code imports `react-native` through this module (see metro.config.js),
 * so every Text and TextInput picks up the in-app text size and the Inter UI
 * font without each screen opting in. Everything else is passed through lazily.
 */
const ReactNative = require('react-native');
const { ScaledText, ScaledTextInput } = require('./ScaledText');

const overrides = { Text: ScaledText, TextInput: ScaledTextInput };
const shim = {};

Object.keys(ReactNative).forEach((key) => {
    if (key in overrides) return;
    Object.defineProperty(shim, key, { enumerable: true, get: () => ReactNative[key] });
});
Object.keys(overrides).forEach((key) => {
    Object.defineProperty(shim, key, { enumerable: true, value: overrides[key] });
});
Object.defineProperty(shim, '__esModule', { value: true });

module.exports = shim;
