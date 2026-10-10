import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { easeOut, useReducedMotion } from '../motion';
import {
    BODY,
    BODY_LEAVES,
    COLORS,
    GUITAR_ROTATION,
    HEAD_LEAVES,
    NECK,
    STRINGS,
    VIEWBOX,
    WAVES_LEFT,
    WAVES_RIGHT,
} from './guitarPaths';

const breathe = (period) =>
    withRepeat(withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.sin) }), -1, true);

/** Native twin of GuitarMark.web.js: waves and body are separate layers so they animate with transforms. */
export default function GuitarMark(props) {
    const { size = 96, waves = 'idle', sway = false, style } = props;
    const reduceMotion = useReducedMotion();
    const wave = useSharedValue(waves === 'once' ? 0 : 0.5);
    const tilt = useSharedValue(0);

    useEffect(() => {
        cancelAnimation(wave);
        if (reduceMotion || waves === 'static') {
            wave.value = 1;
            return;
        }
        if (waves === 'once') {
            wave.value = 0;
            wave.value = withDelay(200, withTiming(1, { duration: 500, easing: easeOut }));
        } else {
            wave.value = 0;
            wave.value = breathe(waves === 'thinking' ? 900 : 3000);
        }
    }, [waves, reduceMotion, wave]);

    useEffect(() => {
        if (!sway || reduceMotion) return;
        tilt.value = withSequence(
            withTiming(-5, { duration: 600, easing: Easing.inOut(Easing.sin) }),
            withTiming(4, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 600, easing: Easing.inOut(Easing.sin) })
        );
    }, [sway, reduceMotion, tilt]);

    const leftStyle = useAnimatedStyle(() => ({
        opacity: 0.55 + wave.value * 0.45,
        transform: [{ scale: 0.94 + wave.value * 0.1 }],
    }));
    const rightStyle = leftStyle;
    const bodyStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.value}deg` }] }));

    const layer = { width: size, height: size };
    return (
        <View style={[layer, style]} accessible={false} importantForAccessibility="no-hide-descendants">
            <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '22% 68%' }, leftStyle]}>
                <Svg viewBox={VIEWBOX} width={size} height={size}>
                    <G fill="none" stroke={COLORS.wave} strokeWidth={6} strokeLinecap="round">
                        {WAVES_LEFT.map((d) => (
                            <Path key={d} d={d} />
                        ))}
                    </G>
                </Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '78% 68%' }, rightStyle]}>
                <Svg viewBox={VIEWBOX} width={size} height={size}>
                    <G fill="none" stroke={COLORS.wave} strokeWidth={6} strokeLinecap="round">
                        {WAVES_RIGHT.map((d) => (
                            <Path key={d} d={d} />
                        ))}
                    </G>
                </Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '50% 95%' }, bodyStyle]}>
                <Svg viewBox={VIEWBOX} width={size} height={size}>
                    <G transform={GUITAR_ROTATION} stroke={COLORS.ink} strokeWidth={3.5} strokeLinejoin="round">
                        <Path fill={COLORS.tomato} d={BODY} />
                        <Path fill={COLORS.leaf} d={BODY_LEAVES} />
                        <Path fill={COLORS.orange} d={NECK} />
                        <Path fill={COLORS.leaf} d={HEAD_LEAVES} />
                        <Rect x={60} y={101} width={20} height={5} rx={2} fill={COLORS.cream} stroke="none" />
                        <Rect x={61} y={116} width={18} height={5} rx={2} fill={COLORS.ink} stroke="none" />
                        <Path d={STRINGS} stroke={COLORS.cream} strokeWidth={1.2} />
                    </G>
                </Svg>
            </Animated.View>
        </View>
    );
}
