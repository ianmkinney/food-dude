/**
 * The backdrop behind everything in Galaxy Health.
 *
 * Stars are generated once from a fixed seed, so the sky is stable across
 * re-renders and identical on every launch — a field that reshuffles itself
 * whenever a screen mounts reads as noise, not space. Drift is a single slow
 * transform on the whole layer rather than per-star animation, which keeps this
 * cheap enough to sit under a scrolling list.
 *
 * With reduced motion the field renders static. It is decorative, so losing the
 * drift costs nothing.
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import useReducedMotion from '../../hooks/useReducedMotion';

// A tiny deterministic PRNG. Math.random would give a different sky on every
// mount, and importing a seeded-random dependency for eighty dots is silly.
const makeRandom = (seed) => {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

const buildStars = (count, seed) => {
    const random = makeRandom(seed);
    const stars = [];
    for (let i = 0; i < count; i += 1) {
        // Depth drives size and brightness together: distant stars are small
        // and dim, near ones large and bright.
        const depth = random();
        stars.push({
            key: `s${i}`,
            x: random() * 100,
            y: random() * 100,
            r: 0.35 + depth * 1.15,
            opacity: 0.2 + depth * 0.65,
        });
    }
    return stars;
};

const NEBULAE = [
    { key: 'n1', cx: '22%', cy: '18%', r: '38%', color: '#4B3FA8', opacity: 0.3 },
    { key: 'n2', cx: '82%', cy: '72%', r: '44%', color: '#1F6E8C', opacity: 0.24 },
    { key: 'n3', cx: '58%', cy: '38%', r: '30%', color: '#7A3E86', opacity: 0.18 },
];

const Starfield = ({
    count = 90,
    seed = 20260829,
    drift = true,
    nebula = true,
    style,
}) => {
    const reduceMotion = useReducedMotion();
    const stars = useMemo(() => buildStars(count, seed), [count, seed]);
    const animate = drift && !reduceMotion;

    const t = useSharedValue(0);

    useEffect(() => {
        if (!animate) {
            cancelAnimation(t);
            t.value = 0;
            return undefined;
        }
        t.value = withRepeat(
            withTiming(1, { duration: 90000, easing: Easing.linear }),
            -1,
            false
        );
        return () => cancelAnimation(t);
    }, [animate, t]);

    const driftStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: -t.value * 14 },
            { translateY: t.value * 8 },
        ],
    }));

    return (
        <View style={[StyleSheet.absoluteFill, styles.root, style]} pointerEvents="none">
            {nebula ? (
                <Svg style={StyleSheet.absoluteFill}>
                    <Defs>
                        {NEBULAE.map((n) => (
                            <RadialGradient key={`g-${n.key}`} id={`neb-${n.key}`} cx="50%" cy="50%" r="50%">
                                <Stop offset="0%" stopColor={n.color} stopOpacity={n.opacity} />
                                <Stop offset="100%" stopColor={n.color} stopOpacity={0} />
                            </RadialGradient>
                        ))}
                    </Defs>
                    {NEBULAE.map((n) => (
                        <Rect
                            key={n.key}
                            x={0}
                            y={0}
                            width="100%"
                            height="100%"
                            fill={`url(#neb-${n.key})`}
                        />
                    ))}
                </Svg>
            ) : null}

            <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
                <Svg style={StyleSheet.absoluteFill}>
                    {stars.map((star) => (
                        <Circle
                            key={star.key}
                            cx={`${star.x}%`}
                            cy={`${star.y}%`}
                            r={star.r}
                            fill="#FFFFFF"
                            opacity={star.opacity}
                        />
                    ))}
                </Svg>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        overflow: 'hidden',
    },
});

export default Starfield;
