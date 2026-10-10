import React from 'react';
import { Pressable } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { motion } from '../theme';
import { EASE_OUT } from '../motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

/**
 * @param {{ children?: any, style?: any, onPressIn?: (e: any) => void, onPressOut?: (e: any) => void, scaleTo?: number, tilt?: boolean, disabled?: boolean, [key: string]: any }} props
 */
const AnimatedPressable = ({
    children,
    style,
    onPressIn,
    onPressOut,
    scaleTo = motion.scale.press,
    tilt = false,
    disabled = false,
    ...rest
}) => {
    const reduceMotion = useReducedMotion();
    const scale = useSharedValue(1);
    const rotateZ = useSharedValue(0);
    const rotateX = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 600 },
            { scale: scale.value },
            { rotateX: `${rotateX.value}deg` },
            { rotateZ: `${rotateZ.value}deg` },
        ],
    }));

    const handlePressIn = (event) => {
        if (!disabled && !reduceMotion) {
            scale.value = withTiming(scaleTo, { duration: motion.duration.fast, easing: EASE_OUT });
            if (tilt) {
                rotateZ.value = withSpring(-motion.tilt.press, motion.spring.press);
                rotateX.value = withSpring(4, motion.spring.press);
            }
        }
        onPressIn?.(event);
    };

    const handlePressOut = (event) => {
        if (!reduceMotion) {
            scale.value = withSpring(1, motion.spring.press);
            rotateZ.value = withSpring(0, motion.spring.press);
            rotateX.value = withSpring(0, motion.spring.press);
        }
        onPressOut?.(event);
    };

    return (
        <AnimatedPressableBase
            style={[style, animatedStyle]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
            {...rest}
        >
            {children}
        </AnimatedPressableBase>
    );
};

export default AnimatedPressable;
