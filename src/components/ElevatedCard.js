import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { getSurfaceStyle, motion } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EASE_OUT, riseIn } from '../motion';
import AnimatedPressable from './AnimatedPressable';

const layoutTransition = LinearTransition.duration(motion.duration.base).easing(EASE_OUT);

const ElevatedCard = ({
    theme,
    variant = 'card',
    onPress,
    style,
    children,
    index,
    disabled,
    tilt = false,
    entering = true,
    ...rest
}) => {
    const reduceMotion = useReducedMotion();
    const surface = getSurfaceStyle({ ...theme, platform: Platform.OS }, variant);
    const enter = entering && typeof index === 'number' ? riseIn(index, reduceMotion) : undefined;
    const layout = reduceMotion ? undefined : layoutTransition;

    if (onPress) {
        return (
            <AnimatedPressable
                entering={enter}
                layout={layout}
                onPress={onPress}
                disabled={disabled}
                tilt={tilt}
                style={[styles.card, surface, style]}
                {...rest}
            >
                {children}
            </AnimatedPressable>
        );
    }

    return (
        <Animated.View entering={enter} layout={layout} style={[styles.card, surface, style]} {...rest}>
            {children}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    card: {},
});

export default ElevatedCard;
