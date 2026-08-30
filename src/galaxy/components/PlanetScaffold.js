/**
 * The frame every planet screen sits in.
 *
 * It owns the three things all four worlds share — the star field behind the
 * content, the way back to the Bridge, and the planet's current name — so a
 * domain screen only has to describe its own instruments. Content arrives as a
 * render prop rather than plain children because each screen needs the resolved
 * theme and its planet's accent ramp, and threading those through context would
 * make the accent ambiguous on screens that show more than one world.
 *
 * The display name is read from the database rather than the registry, since
 * the user can rename any world from the Bridge. It refreshes on the
 * `PLANETS_CHANGED` event so a rename lands here without a remount.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { planetOperations } from '../../database/galaxy';
import { EVENTS, on } from '../eventBus';
import { getPlanet, getDefaultName } from '../planets';
import Starfield from './Starfield';
import useReducedMotion from '../../hooks/useReducedMotion';
import { useTheme } from '../../context/ThemeContext';
import { getAccent, getTheme } from '../../theme';

const PlanetScaffold = ({ planetId, subtitle, children }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, Platform.OS, planetId);
    const accent = getAccent(planetId);
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const reduceMotion = useReducedMotion();

    const planet = getPlanet(planetId);
    const [name, setName] = useState(() => getDefaultName(planetId));

    const loadName = useCallback(async () => {
        try {
            const rows = await planetOperations.getAll();
            const match = (rows || []).find((row) => row.id === planetId);
            if (match && match.display_name) setName(match.display_name);
        } catch {
            // The registry default is already showing; a missing name is not
            // worth interrupting the screen for.
        }
    }, [planetId]);

    useEffect(() => {
        loadName();
        return on(EVENTS.PLANETS_CHANGED, loadName);
    }, [loadName]);

    const toBridge = useCallback(() => {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('Bridge');
    }, [navigation]);

    const titleEntering = reduceMotion
        ? FadeIn.duration(200)
        : FadeInDown.springify().damping(20).stiffness(150);

    return (
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
            <Starfield count={70} seed={planetId.length * 7919} />

            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Pressable
                    onPress={toBridge}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Back to the Bridge"
                    style={[
                        styles.back,
                        {
                            borderColor: theme.colors.borderSoft,
                            backgroundColor: theme.colors.surfaceGlass,
                        },
                    ]}
                >
                    <Ionicons name="chevron-back" size={16} color={theme.colors.text.secondary} />
                    <Text style={[styles.backLabel, { color: theme.colors.text.secondary }]}>
                        BRIDGE
                    </Text>
                </Pressable>

                <View
                    style={[
                        styles.marker,
                        { backgroundColor: accent[500] },
                        theme.glowFor(accent.glow, 0.6),
                    ]}
                />
            </View>

            <Animated.View entering={titleEntering} style={styles.titleBlock}>
                <Text style={[styles.title, { color: theme.colors.text.primary }]}>{name}</Text>
                <Text style={[styles.subtitle, { color: accent[isDark ? 300 : 600] }]}>
                    {(subtitle || (planet && planet.role) || '').toUpperCase()}
                </Text>
            </Animated.View>

            <View style={styles.body}>{children({ theme, accent })}</View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 4,
    },
    back: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingVertical: 6,
        paddingLeft: 6,
        paddingRight: 11,
        borderRadius: 999,
        borderWidth: 1,
    },
    backLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.4,
    },
    marker: {
        width: 9,
        height: 9,
        borderRadius: 999,
    },
    titleBlock: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 14,
        gap: 3,
    },
    title: {
        fontSize: 30,
        fontWeight: '800',
        letterSpacing: -0.6,
    },
    subtitle: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.6,
    },
    body: {
        flex: 1,
    },
});

export default PlanetScaffold;
