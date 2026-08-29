import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { getSurfaceStyle, motion } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import AnimatedPressable from './AnimatedPressable';

const ElevatedCard = ({
    theme,
    variant = 'card',
    onPress,
    style,
    children,
    index,
    disabled,
    tilt = true,
    entering = true,
}) => {
    const reduceMotion = useReducedMotion();
    const surface = getSurfaceStyle({ ...theme, platform: Platform.OS }, variant);
    const enter =
        entering && !reduceMotion && typeof index === 'number'
            ? FadeInDown.duration(motion.duration.enter)
                  .delay(Math.min(index, 8) * motion.stagger)
                  .springify()
            : undefined;
    const layout = reduceMotion ? undefined : LinearTransition.springify();

    if (onPress) {
        return (
            <AnimatedPressable
                entering={enter}
                layout={layout}
                onPress={onPress}
                disabled={disabled}
                tilt={tilt}
                style={[styles.card, surface, style]}
            >
                {children}
            </AnimatedPressable>
        );
    }

    return (
        <Animated.View entering={enter} layout={layout} style={[styles.card, surface, style]}>
            {children}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    card: {},
});

export default ElevatedCard;
