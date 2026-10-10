import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { useReducedMotion } from '../motion';

const DOTS = [0, 1, 2];

function Dot({ index, color, reduceMotion }) {
    const lift = useSharedValue(0);
    useEffect(() => {
        if (reduceMotion) return undefined;
        // Each dot is a string being strummed in turn: a quick lift, then a damped settle.
        lift.value = withDelay(
            index * 110,
            withRepeat(
                withSequence(
                    withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }),
                    withTiming(-0.35, { duration: 150, easing: Easing.inOut(Easing.quad) }),
                    withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) }),
                    withTiming(0, { duration: 330 })
                ),
                -1
            )
        );
        return () => cancelAnimation(lift);
    }, [index, reduceMotion, lift]);

    const style = useAnimatedStyle(() => ({
        opacity: 0.45 + Math.max(lift.value, 0) * 0.55,
        transform: [{ translateY: -lift.value * 5 }],
    }));
    return <Animated.View style={[styles.dot, { backgroundColor: color }, reduceMotion ? styles.still : style]} />;
}

/** Three-dot "strumming" indicator shown while Ampi is thinking. */
export default function StrumIndicator({ color }) {
    const reduceMotion = useReducedMotion();
    return (
        <View style={styles.row} accessible={false}>
            {DOTS.map((i) => (
                <Dot key={i} index={i} color={color} reduceMotion={reduceMotion} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 16 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    still: { opacity: 0.8 },
});
