import React, { createContext, forwardRef, useContext } from 'react';
// This folder is excluded from the metro redirect, so this is the real module.
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
import { UI_FONTS } from './fonts';
import { TextScaleContext } from './textScale';

const InsideText = createContext(false);
const IS_WEB = Platform.OS === 'web';
const DEFAULT_SIZE = 14;
// iOS Safari zooms the page when a focused field is under 16px.
const MIN_INPUT_SIZE_WEB = 16;

const uiFontFor = (weight) => {
    if (IS_WEB) return UI_FONTS.regular;
    switch (String(weight ?? '400')) {
        case '500':
            return UI_FONTS.medium;
        case '600':
            return UI_FONTS.semibold;
        case '700':
        case 'bold':
            return UI_FONTS.bold;
        case '800':
        case '900':
            return UI_FONTS.extrabold;
        default:
            return UI_FONTS.regular;
    }
};

function scaledStyle(style, { scale, nested, maxScale, minSize }) {
    const flat = StyleSheet.flatten(style) || {};
    const effective = maxScale ? Math.min(scale, maxScale) : scale;
    const extra = {};
    if (!flat.fontFamily && (!nested || flat.fontWeight != null)) {
        extra.fontFamily = uiFontFor(flat.fontWeight);
        // Native custom fonts carry their own weight; a second synthetic bold looks smeared.
        if (!IS_WEB && flat.fontWeight != null) extra.fontWeight = 'normal';
    }
    if (effective !== 1 || minSize) {
        if (flat.fontSize != null || !nested) {
            const size = (flat.fontSize ?? DEFAULT_SIZE) * effective;
            extra.fontSize = minSize ? Math.max(size, minSize) : size;
        }
        if (typeof flat.lineHeight === 'number') extra.lineHeight = flat.lineHeight * effective;
    }
    return Object.keys(extra).length ? [style, extra] : style;
}

export const ScaledText = forwardRef(function ScaledText(props, ref) {
    const { scale, explicit } = useContext(TextScaleContext);
    const nested = useContext(InsideText);
    const style = scaledStyle(props.style, { scale, nested, maxScale: props.maxFontSizeMultiplier });
    const allowFontScaling = explicit ? false : props.allowFontScaling;
    const text = <Text {...props} ref={ref} style={style} allowFontScaling={allowFontScaling} />;
    return nested ? text : <InsideText.Provider value>{text}</InsideText.Provider>;
});

export const ScaledTextInput = forwardRef(function ScaledTextInput(props, ref) {
    const { scale, explicit } = useContext(TextScaleContext);
    const style = scaledStyle(props.style, {
        scale,
        nested: false,
        maxScale: props.maxFontSizeMultiplier,
        minSize: IS_WEB ? MIN_INPUT_SIZE_WEB : 0,
    });
    const allowFontScaling = explicit ? false : props.allowFontScaling;
    return <TextInput {...props} ref={ref} style={style} allowFontScaling={allowFontScaling} />;
});

// Keep `TextInput.State` (focus helpers) reachable. Copying every static would
// also copy forwardRef's own `render` and bypass the wrapper.
if (TextInput.State) ScaledTextInput.State = TextInput.State;
