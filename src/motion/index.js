import React, { useEffect } from 'react';
import Animated, {
    Easing,
    FadeIn,
    FadeOut,
    LinearTransition,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { motion } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

export { useReducedMotion, isReducedMotion } from '../hooks/useReducedMotion';

export const easeOut = Easing.bezier(...motion.easing.bezier);

export const timing = (duration = motion.duration.base) => ({ duration, easing: easeOut });

export const spring = motion.spring.base;

export const fadeIn = (duration = motion.duration.base) => FadeIn.duration(duration);
export const fadeOut = (duration = motion.duration.fast) => FadeOut.duration(duration);

export const layoutSpring = () =>
    LinearTransition.springify().stiffness(motion.spring.base.stiffness).damping(motion.spring.base.damping);

/**
 * Mount-time entrance: fade plus a rise of `distance` px, delayed by
 * `index * stagger`. Built on shared values rather than Reanimated `entering`
 * presets, because custom presets on web leave the element absolutely
 * positioned once they finish.
 */
export function useEnterStyle(options = {}) {
    const {
        index = 0,
        stagger = motion.stagger,
        distance = motion.rise,
        enabled = true,
        springy = false,
        maxIndex = 10,
    } = options;
    const reduceMotion = useReducedMotion();
    const active = enabled && !reduceMotion;
    const progress = useSharedValue(active ? 0 : 1);

    useEffect(() => {
        if (!active) {
            progress.value = 1;
            return;
        }
        const delay = Math.min(index, maxIndex) * stagger;
        progress.value = withDelay(delay, springy ? withSpring(1, motion.spring.base) : withTiming(1, timing()));
        // Entrance runs once, on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return useAnimatedStyle(() => ({
        opacity: Math.min(progress.value, 1),
        transform: [{ translateY: (1 - progress.value) * distance }],
    }));
}

/** View wrapper around `useEnterStyle`: chips, list rows, cards. */
export function Enter(props) {
    const { children, style, index, stagger, distance, enabled, springy, ...rest } = props;
    const enterStyle = useEnterStyle({ index, stagger, distance, enabled, springy });
    return (
        <Animated.View style={[style, enterStyle]} {...rest}>
            {children}
        </Animated.View>
    );
}
