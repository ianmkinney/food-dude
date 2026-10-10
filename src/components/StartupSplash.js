import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GuitarMark from '../brand/GuitarMark';
import { useTheme } from '../context/ThemeContext';
import { getTheme, motion } from '../theme';
import { easeOut, isReducedMotion } from '../motion';

export const signalAppReady = () => {};
export const hasStartupOverlay = true;

const LETTERS = [
    ['A', 'ink'], ['m', 'ink'], ['p', 'ink'], ['l', 'ink'], ['i', 'ink'],
    ['F', 'orange'], ['o', 'tomato'], ['o', 'tomato'], ['d', 'leaf'],
];
const INTRO_MS = 1050;

function Letter({ char, color, index, animate }) {
    const p = useSharedValue(animate ? 0 : 1);
    useEffect(() => {
        if (animate) p.value = withDelay(420 + index * motion.letterStagger, withTiming(1, { duration: 350, easing: easeOut }));
    }, [animate, index, p]);
    const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 14 }] }));
    return <Animated.Text style={[styles.letter, { color }, style]}>{char}</Animated.Text>;
}

/**
 * Native startup (once per launch, about 1.2s, tap to skip): the guitar scales
 * in and its waves pulse twice, the letters rise with a 30ms stagger, then the
 * lockup shrinks toward the header while the app fades in.
 */
export default function StartupSplash({ ready, onDone }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const insets = useSafeAreaInsets();
    const animate = useRef(!isReducedMotion()).current;
    const [introDone, setIntroDone] = useState(!animate);
    const mark = useSharedValue(animate ? 0 : 1);
    const pulse = useSharedValue(1);
    const exit = useSharedValue(0);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (!animate) return undefined;
        mark.value = withTiming(1, { duration: 500, easing: easeOut });
        pulse.value = withDelay(620, withRepeat(withSequence(withTiming(1.08, { duration: 125 }), withTiming(1, { duration: 125 })), 2, false));
        const t = setTimeout(() => setIntroDone(true), INTRO_MS);
        return () => clearTimeout(t);
    }, [animate, mark, pulse]);

    useEffect(() => {
        if (!ready || !introDone) return;
        const finish = () => onDone?.();
        exit.value = withTiming(1, { duration: animate ? motion.duration.slow : 300, easing: easeOut }, (done) => {
            if (done) runOnJS(finish)();
        });
    }, [ready, introDone, animate, exit, onDone]);

    const ink = isDark ? '#FFF4E3' : theme.brand.ink;
    const palette = { ink, orange: theme.brand.burntOrange, tomato: theme.brand.tomato, leaf: theme.brand.garden };
    const flyY = -(height / 2) + insets.top + 28 - 38;

    const bgStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
    const lockupStyle = useAnimatedStyle(() => ({
        opacity: animate ? 1 - exit.value : 1,
        transform: animate
            ? [{ translateY: exit.value * flyY }, { scale: 1 - exit.value * 0.4 }]
            : [],
    }));
    const markStyle = useAnimatedStyle(() => ({
        opacity: mark.value,
        transform: [{ scale: (0.85 + mark.value * 0.15) * pulse.value * (1 - exit.value * 0.7) }],
    }));

    return (
        <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIntroDone(true)}
            onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
            accessibilityLabel="AmpliFood is starting"
        >
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }, bgStyle]} />
            <View style={styles.center} pointerEvents="none">
                <Animated.View style={[styles.lockup, lockupStyle]}>
                    <Animated.View style={markStyle}>
                        <GuitarMark size={132} waves="static" />
                    </Animated.View>
                    <View style={styles.word}>
                        {LETTERS.map(([char, tone], i) => (
                            <Letter key={i} char={char} color={palette[tone]} index={i} animate={animate} />
                        ))}
                    </View>
                </Animated.View>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    lockup: { alignItems: 'center', gap: 10 },
    word: { flexDirection: 'row' },
    letter: { fontFamily: 'Fredoka_700Bold', fontSize: 44, lineHeight: 52 },
});

