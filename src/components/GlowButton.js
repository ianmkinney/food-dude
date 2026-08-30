/**
 * The primary control of the Galaxy Health shell: a button that behaves like a
 * physical switch on a console.
 *
 * Pressing it compresses the body, brightens the bloom behind it, and fires a
 * haptic tick. Releasing overshoots very slightly on the way back, which is
 * what makes it feel sprung rather than animated. When the user has asked for
 * less motion, the scale work is dropped and only the brightness change
 * remains, so the button still confirms the press.
 */

import React, { useCallback, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import useReducedMotion from '../hooks/useReducedMotion';
import { typography } from '../theme';

const SIZES = {
    sm: { paddingV: 9, paddingH: 14, font: 12, icon: 15, gap: 7, radius: 12 },
    md: { paddingV: 13, paddingH: 18, font: 13, icon: 17, gap: 9, radius: 14 },
    lg: { paddingV: 16, paddingH: 22, font: 14, icon: 19, gap: 10, radius: 16 },
};

const HAPTIC_STYLE = {
    light: Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

// Haptics are a no-op on web and throw on some Android builds without the
// vibrate permission, so every call is fire-and-forget.
const tick = (haptic) => {
    if (!haptic || Platform.OS === 'web') return;
    const style = HAPTIC_STYLE[haptic] || HAPTIC_STYLE.light;
    Haptics.impactAsync(style).catch(() => {});
};

const GlowButton = ({
    label,
    icon,
    onPress,
    theme,
    accent,
    variant = 'solid',
    size = 'md',
    full = false,
    disabled = false,
    haptic = 'light',
    style,
}) => {
    const reduceMotion = useReducedMotion();
    const metrics = SIZES[size] || SIZES.md;
    const ramp = accent || theme.planetAccent;

    const pressed = useSharedValue(0);

    const onPressIn = useCallback(() => {
        pressed.value = reduceMotion
            ? withTiming(1, { duration: 90 })
            : withSpring(1, { damping: 18, stiffness: 420, mass: 0.5 });
        tick(haptic);
    }, [haptic, pressed, reduceMotion]);

    const onPressOut = useCallback(() => {
        pressed.value = reduceMotion
            ? withTiming(0, { duration: 140 })
            : withSpring(0, { damping: 12, stiffness: 320, mass: 0.6 });
    }, [pressed, reduceMotion]);

    const bodyStyle = useAnimatedStyle(() => {
        const t = pressed.value;
        return {
            transform: reduceMotion ? [] : [{ scale: 1 - t * 0.035 }],
            opacity: disabled ? 0.45 : 1,
        };
    }, [disabled, reduceMotion]);

    const bloomStyle = useAnimatedStyle(() => ({
        opacity: disabled ? 0 : 0.28 + pressed.value * 0.5,
        transform: reduceMotion ? [] : [{ scale: 1 + pressed.value * 0.12 }],
    }), [disabled, reduceMotion]);

    const skin = useMemo(() => {
        if (variant === 'outline') {
            return {
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.6)',
                borderColor: ramp[theme.isDark ? 700 : 300],
                textColor: ramp[theme.isDark ? 200 : 700],
            };
        }
        if (variant === 'ghost') {
            return {
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                textColor: ramp[theme.isDark ? 200 : 700],
            };
        }
        return {
            backgroundColor: ramp[600],
            borderColor: ramp[400],
            textColor: '#FFFFFF',
        };
    }, [ramp, theme.isDark, variant]);

    return (
        <View style={[full && styles.full, style]}>
            {variant === 'solid' ? (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.bloom,
                        { borderRadius: metrics.radius + 6, backgroundColor: ramp.glow },
                        bloomStyle,
                    ]}
                />
            ) : null}

            <Pressable
                onPress={disabled ? undefined : onPress}
                onPressIn={disabled ? undefined : onPressIn}
                onPressOut={disabled ? undefined : onPressOut}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled }}
                hitSlop={6}
            >
                <Animated.View
                    style={[
                        styles.body,
                        {
                            backgroundColor: skin.backgroundColor,
                            borderColor: skin.borderColor,
                            borderRadius: metrics.radius,
                            paddingVertical: metrics.paddingV,
                            paddingHorizontal: metrics.paddingH,
                            gap: metrics.gap,
                        },
                        variant === 'solid' && !disabled ? theme.glowFor(ramp.glow, 0.45) : null,
                        bodyStyle,
                    ]}
                >
                    {icon ? (
                        <Ionicons name={icon} size={metrics.icon} color={skin.textColor} />
                    ) : null}
                    <Text
                        numberOfLines={1}
                        style={[
                            styles.label,
                            { color: skin.textColor, fontSize: metrics.font },
                        ]}
                    >
                        {label}
                    </Text>
                </Animated.View>
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    full: {
        alignSelf: 'stretch',
    },
    bloom: {
        position: 'absolute',
        top: 2,
        left: 2,
        right: 2,
        bottom: 2,
    },
    body: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    label: {
        fontWeight: '700',
        letterSpacing: typography.letterSpacing?.wide ?? 1.1,
    },
});

export default GlowButton;
