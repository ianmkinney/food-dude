import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { motion } from '../theme';
import { timing, useReducedMotion } from '../motion';

/**
 * Planner drop feedback: when a slot goes from empty to filled, its content
 * settles in with a soft scale spring while an accent wash fades out.
 */
export default function SlotSettle(props) {
    const { filled, color, radius = 12, children } = props;
    const reduceMotion = useReducedMotion();
    const scale = useSharedValue(1);
    const wash = useSharedValue(0);
    const wasFilled = useRef(filled);

    useEffect(() => {
        const justFilled = filled && !wasFilled.current;
        wasFilled.current = filled;
        if (!justFilled || reduceMotion) return;
        scale.value = withSequence(withTiming(0.8, { duration: 0 }), withSpring(1, motion.spring.soft));
        wash.value = withSequence(withTiming(0.28, { duration: 0 }), withTiming(0, timing(motion.duration.slow)));
        // Shared values are stable; only `filled` drives this.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filled, reduceMotion]);

    const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    const washStyle = useAnimatedStyle(() => ({ opacity: wash.value }));

    return (
        <>
            <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: radius }, washStyle]}
            />
            <Animated.View style={contentStyle}>{children}</Animated.View>
        </>
    );
}
