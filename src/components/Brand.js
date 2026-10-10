import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

const WORDMARK = require('../../assets/brand/wordmark.png');
const WORDMARK_DARK = require('../../assets/brand/wordmark-dark.png');
const MARK_COLOR = require('../../assets/brand/mark-color.png');
const MARK_INK = require('../../assets/brand/mark-ink.png');

const WORDMARK_ASPECT = 521 / 108;
const MARK_COLOR_ASPECT = 375 / 480;
const MARK_INK_ASPECT = 245 / 240;

export const Wordmark = ({ height = 26, style }) => {
    const { isDark } = useTheme();
    return (
        <Image
            source={isDark ? WORDMARK_DARK : WORDMARK}
            style={[{ height, width: height * WORDMARK_ASPECT }, style]}
            resizeMode="contain"
            accessibilityRole="header"
            accessibilityLabel="AmpliFood"
        />
    );
};

/**
 * The food-guitar mark. `color` is for warm, discovery moments (loading, empty
 * states); `ink` is the black-and-white stamp for small and editorial spots and
 * flips to cream in dark mode.
 */
export const BrandMark = ({ variant = 'color', size = 96, style }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    if (variant === 'ink') {
        return (
            <Image
                source={MARK_INK}
                style={[
                    { height: size, width: size * MARK_INK_ASPECT, tintColor: theme.colors.text.primary },
                    style,
                ]}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
                accessible={false}
            />
        );
    }
    return (
        <Image
            source={MARK_COLOR}
            style={[{ height: size, width: size * MARK_COLOR_ASPECT }, style]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessible={false}
        />
    );
};

/** A short ink/cream checkerboard band, the brand's tablecloth. Use sparingly. */
export const CheckerStrip = ({ squares = 12, size = 8, rows = 2, style }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const ink = isDark ? theme.brand.cream : theme.brand.ink;
    const light = isDark ? theme.colors.background : theme.brand.cream;
    return (
        <View style={[styles.checker, style]} accessible={false}>
            {Array.from({ length: rows }).map((_, row) => (
                <View key={row} style={styles.checkerRow}>
                    {Array.from({ length: squares }).map((__, col) => (
                        <View
                            key={col}
                            style={{
                                width: size,
                                height: size,
                                backgroundColor: (row + col) % 2 === 0 ? ink : light,
                            }}
                        />
                    ))}
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    checker: {
        alignSelf: 'center',
    },
    checkerRow: {
        flexDirection: 'row',
    },
});
