import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { getTheme } from '../theme';
import { useReducedMotion } from '../motion';

/** One shimmer band sweeps across every block, so the whole placeholder moves as one. */
export function SkeletonBlock({ width = '100%', height = 16, radius = 12, style }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const reduceMotion = useReducedMotion();
    const [w, setW] = useState(0);
    const sweep = useSharedValue(0);

    useEffect(() => {
        if (reduceMotion || !w) return undefined;
        sweep.value = 0;
        sweep.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, false);
        return () => cancelAnimation(sweep);
    }, [reduceMotion, w, sweep]);

    const band = useAnimatedStyle(() => ({
        transform: [{ translateX: -w + sweep.value * w * 2 }],
    }));

    return (
        <View
            onLayout={(e) => setW(e.nativeEvent.layout.width)}
            style={[styles.block, { width, height, borderRadius: radius, backgroundColor: theme.colors.surfaceMuted }, style]}
        >
            {!reduceMotion && (
                <Animated.View
                    style={[
                        styles.band,
                        { backgroundColor: isDark ? 'rgba(255,244,227,0.06)' : 'rgba(255,255,255,0.7)' },
                        band,
                    ]}
                />
            )}
        </View>
    );
}

/** Generic screen placeholder: a title bar and a few list rows. */
export default function ScreenSkeleton() {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    return (
        <View
            style={[styles.screen, { backgroundColor: theme.colors.background }]}
            accessibilityRole="progressbar"
            accessibilityLabel="Loading"
        >
            <SkeletonBlock height={44} radius={16} />
            {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.row, { borderColor: theme.colors.borderSoft, backgroundColor: theme.colors.surface }]}>
                    <SkeletonBlock width={56} height={56} radius={12} />
                    <View style={styles.rowText}>
                        <SkeletonBlock width="70%" height={16} />
                        <SkeletonBlock width="45%" height={12} />
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    block: { overflow: 'hidden' },
    band: { ...StyleSheet.absoluteFillObject, width: '60%' },
    screen: { flex: 1, padding: 16, gap: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, borderWidth: 1 },
    rowText: { flex: 1, gap: 8 },
});
