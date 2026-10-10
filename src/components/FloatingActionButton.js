import React from 'react';
import { StyleSheet } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { motion } from '../theme';

/**
 * Round action button. `primary` is the screen's one orange call to action;
 * `secondary` is a quiet surface button beside it.
 */
const FloatingActionButton = ({
    theme,
    onPress,
    children,
    variant = 'primary',
    style,
    disabled,
    accessibilityLabel,
    ...rest
}) => {
    const secondary = variant === 'secondary';
    return (
        <AnimatedPressable
            onPress={onPress}
            disabled={disabled}
            scaleTo={motion.scale.pressHard}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={[
                styles.fab,
                secondary ? styles.small : theme.shadows.lg,
                secondary
                    ? { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border, borderWidth: 1 }
                    : { backgroundColor: theme.primary[500] },
                { opacity: disabled ? 0.5 : 1 },
                style,
            ]}
            {...rest}
        >
            {children}
        </AnimatedPressable>
    );
};

const styles = StyleSheet.create({
    fab: {
        width: 56,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    small: {
        width: 48,
        height: 48,
        borderRadius: 12,
    },
});

export default FloatingActionButton;
