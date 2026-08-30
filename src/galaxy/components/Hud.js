/**
 * The read-out kit every planet screen is built from.
 *
 * These are deliberately plain: a panel, a stat, a label, a rule, a bar. The
 * character comes from the shared skin — glass fill, hairline border, uppercase
 * tracked labels — so four different domains can each look like part of the
 * same instrument without coordinating.
 *
 * `HudPanel` takes an `index` and staggers its entrance by it, which is what
 * makes a screen assemble itself top-down on arrival instead of appearing all
 * at once.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import useReducedMotion from '../../hooks/useReducedMotion';
import { getSurfaceStyle, typography } from '../../theme';

const STAGGER_MS = 70;

export const HudLabel = ({ children, color, style }) => (
    <Text style={[styles.label, color ? { color } : null, style]} numberOfLines={1}>
        {children}
    </Text>
);

export const HudDivider = ({ theme, style }) => (
    <View style={[styles.divider, { backgroundColor: theme.colors.borderSoft }, style]} />
);

export const HudPanel = ({ theme, title, icon, index = 0, right, children, style }) => {
    const reduceMotion = useReducedMotion();

    // A panel that slides is nice; a panel that slides while the user has asked
    // for less motion is not. Fade covers both cases.
    const entering = useMemo(() => {
        const delay = index * STAGGER_MS;
        return reduceMotion
            ? FadeIn.duration(180).delay(delay)
            : FadeInDown.springify().damping(18).stiffness(140).delay(delay);
    }, [index, reduceMotion]);

    return (
        <Animated.View
            entering={entering}
            style={[getSurfaceStyle(theme, 'glass'), styles.panel, style]}
        >
            {title || right ? (
                <View style={styles.panelHead}>
                    <View style={styles.panelHeadLeft}>
                        {icon ? (
                            <Ionicons
                                name={icon}
                                size={14}
                                color={theme.colors.text.tertiary}
                                style={styles.panelIcon}
                            />
                        ) : null}
                        <HudLabel color={theme.colors.text.tertiary}>{title}</HudLabel>
                    </View>
                    {right}
                </View>
            ) : null}
            {children}
        </Animated.View>
    );
};

export const HudStat = ({ theme, label, value, unit, tone, icon }) => (
    <View style={styles.stat}>
        <View style={styles.statHead}>
            {icon ? (
                <Ionicons
                    name={icon}
                    size={12}
                    color={tone || theme.colors.text.tertiary}
                    style={styles.statIcon}
                />
            ) : null}
            <HudLabel color={theme.colors.text.tertiary}>{label}</HudLabel>
        </View>
        <View style={styles.statValueRow}>
            <Text
                style={[styles.statValue, { color: tone || theme.colors.text.primary }]}
                numberOfLines={1}
            >
                {value}
            </Text>
            {unit ? (
                <Text style={[styles.statUnit, { color: theme.colors.text.tertiary }]}>
                    {unit}
                </Text>
            ) : null}
        </View>
    </View>
);

export const HudBar = ({ theme, value, max, color, height = 6 }) => {
    const ceiling = Number(max) > 0 ? Number(max) : 1;
    const filled = Math.max(0, Math.min(1, (Number(value) || 0) / ceiling));

    return (
        <View
            style={[
                styles.barTrack,
                { backgroundColor: theme.colors.surfaceMuted, height, borderRadius: height / 2 },
            ]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: ceiling, now: Number(value) || 0 }}
        >
            <View
                style={{
                    width: `${filled * 100}%`,
                    height: '100%',
                    borderRadius: height / 2,
                    backgroundColor: color || theme.colors.text.secondary,
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    panel: {
        padding: 16,
        gap: 12,
    },
    panelHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    panelHeadLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
    },
    panelIcon: {
        marginRight: 7,
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: typography.letterSpacing?.widest ?? 1.6,
        textTransform: 'uppercase',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        width: '100%',
    },
    stat: {
        flexGrow: 1,
        flexBasis: '42%',
        gap: 5,
    },
    statHead: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statIcon: {
        marginRight: 5,
    },
    statValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 5,
    },
    statValue: {
        fontSize: 22,
        fontWeight: '700',
        letterSpacing: -0.4,
    },
    statUnit: {
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    barTrack: {
        width: '100%',
        overflow: 'hidden',
    },
});

export default HudPanel;
