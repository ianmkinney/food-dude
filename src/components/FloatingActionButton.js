import React from 'react';
import { StyleSheet } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { motion } from '../theme';

const FloatingActionButton = ({
    theme,
    onPress,
    children,
    color,
    style,
    disabled,
    accessibilityLabel,
}) => {
    return (
        <AnimatedPressable
            onPress={onPress}
            disabled={disabled}
            scaleTo={motion.scale.pressHard}
            tilt
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={[
                styles.fab,
                theme.shadows.glow,
                { backgroundColor: color || theme.primary[500], opacity: disabled ? 0.5 : 1 },
                style,
            ]}
        >
            {children}
        </AnimatedPressable>
    );
};

const styles = StyleSheet.create({
    fab: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default FloatingActionButton;
