import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Keyframe, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { EASE_OUT, useReducedMotion } from '../motion';
import GuitarMark from './GuitarMark';

const INTRO_MS = 1100;
const LETTERS = [
    { ch: 'A' }, { ch: 'm' }, { ch: 'p' }, { ch: 'l' }, { ch: 'i' },
    { ch: 'F', color: '#F48A38' }, { ch: 'o', color: '#E2261F' }, { ch: 'o', color: '#E2261F' }, { ch: 'd', color: '#4F802F' },
];

// Once per app launch; later mounts (e.g. a remount after an error) only fade.
let playedThisSession = false;

const letterIn = (i: number) =>
    new Keyframe({
        0: { opacity: 0, transform: [{ translateY: 14 }] },
        100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE_OUT },
    })
        .duration(280)
        .delay(500 + i * 30);

const markIn = new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.86 }] },
    100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_OUT },
}).duration(450);

/**
 * Native startup: guitar settles in, waves pulse twice, the letters rise, then
 * the wordmark lifts toward the header as the overlay fades. Tap to skip.
 */
export default function StartupSplash({ ready, fontsLoaded }: { ready: boolean; fontsLoaded?: boolean }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const reduce = useReducedMotion();
    const { height } = useWindowDimensions();
    const [quick] = useState(() => playedThisSession || reduce);
    const [visible, setVisible] = useState(true);
    const [skipped, setSkipped] = useState(false);
    const started = useRef(Date.now());
    const overlay = useSharedValue(1);
    const lift = useSharedValue(0);

    useEffect(() => {
        playedThisSession = true;
    }, []);

    useEffect(() => {
        if (!ready || !visible) return;
        const wait = quick || skipped ? 0 : Math.max(0, INTRO_MS - (Date.now() - started.current));
        const timer = setTimeout(() => {
            const hide = () => setVisible(false);
            if (!quick) lift.value = withTiming(1, { duration: 240, easing: EASE_OUT });
            overlay.value = withTiming(0, { duration: reduce ? 150 : 300, easing: EASE_OUT }, (finished) => {
                if (finished) runOnJS(hide)();
            });
        }, wait);
        return () => clearTimeout(timer);
    }, [ready, visible, quick, skipped, reduce, overlay, lift]);

    const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value }));
    const wordStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: -lift.value * (height / 2 - 60) }, { scale: 1 - lift.value * 0.5 }],
    }));

    if (!visible) return null;
    const animate = !quick && !skipped;
    const display = fontsLoaded ? { fontFamily: theme.typography.fonts.display } : { fontWeight: '800' as const };

    return (
        <Animated.View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.colors.background }, overlayStyle]}>
            <Pressable style={styles.stage} onPress={() => setSkipped(true)} accessibilityLabel="AmpliFood is starting" accessibilityHint="Tap to skip the intro">
                <Animated.View entering={animate ? markIn : undefined}>
                    <GuitarMark size={150} waves={animate ? 'twice' : 'static'} waveDelay={450} />
                </Animated.View>
                <Animated.View style={[styles.word, wordStyle]}>
                    {LETTERS.map((l, i) => (
                        <Animated.View key={i} entering={animate ? letterIn(i) : undefined}>
                            <Text style={[styles.letter, display, { color: l.color || theme.colors.text.primary }]}>{l.ch}</Text>
                        </Animated.View>
                    ))}
                </Animated.View>
                {animate ? <Text style={[styles.hint, { color: theme.colors.text.tertiary }]}>Tap to skip</Text> : <View />}
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    root: { zIndex: 1000, elevation: 1000 },
    stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    word: { flexDirection: 'row' },
    letter: { fontSize: 52, lineHeight: 58 },
    hint: { position: 'absolute', bottom: 48, fontSize: 13 },
});
