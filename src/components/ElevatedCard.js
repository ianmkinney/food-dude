import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { getSurfaceStyle } from '../theme';
import { layoutSpring, useEnterStyle, useReducedMotion } from '../motion';
import AnimatedPressable from './AnimatedPressable';

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
}) => {
    const reduceMotion = useReducedMotion();
    const surface = getSurfaceStyle({ ...theme, platform: Platform.OS }, variant);
    const enterStyle = useEnterStyle({ index: index ?? 0, enabled: entering && typeof index === 'number' });
    const layout = reduceMotion ? undefined : layoutSpring();

    if (onPress) {
        return (
            <Animated.View layout={layout} style={enterStyle}>
                <AnimatedPressable
                    onPress={onPress}
                    disabled={disabled}
                    tilt={tilt}
                    style={[styles.card, surface, style]}
                >
                    {children}
                </AnimatedPressable>
            </Animated.View>
        );
    }

    return (
        <Animated.View layout={layout} style={[styles.card, surface, style, enterStyle]}>
            {children}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    card: {},
});

export default ElevatedCard;
