import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { motion } from '../theme';
import { navigateWithTransition } from '../motion/viewTransition';

const FloatingActionButton = ({
    theme,
    onPress,
    children,
    color,
    style,
    disabled,
    accessibilityLabel,
    morphTo,
}) => {
    // The fill lives on a plain View so the web view transition can name a
    // real DOM node and morph it into the destination sheet.
    const fillRef = useRef(null);
    const handlePress = morphTo
        ? () => navigateWithTransition(onPress, { sourceRef: fillRef, name: morphTo })
        : onPress;
    return (
        <AnimatedPressable
            onPress={handlePress}
            disabled={disabled}
            scaleTo={motion.scale.press}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={[
                styles.fab,
                theme.shadows.glow,
                { opacity: disabled ? 0.5 : 1 },
                style,
            ]}
        >
            <View
                ref={fillRef}
                pointerEvents="none"
                style={[styles.fill, { backgroundColor: color || theme.primary[500] }]}
            />
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
    fill: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 28,
    },
});

export default FloatingActionButton;
