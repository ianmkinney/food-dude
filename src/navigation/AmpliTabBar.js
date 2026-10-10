import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CommonActions, useLinkBuilder } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useTourTarget } from '../onboarding/tourTargets';
import { EASE_OUT, SPRING, useReducedMotion } from '../motion';

const PILL_INSET = 6;

const hasModifierKey = (e) => !!(e?.metaKey || e?.altKey || e?.ctrlKey || e?.shiftKey);

function TabItem({ route, label, icon, focused, href, onPress, onLongPress, preload, theme, reduce }) {
    const tourRef = useTourTarget(`tab-${route.name}`);
    const bounce = useSharedValue(1);
    const press = useSharedValue(1);

    useEffect(() => {
        if (focused && !reduce) {
            bounce.value = withSequence(
                withTiming(1.18, { duration: motion.duration.fast, easing: EASE_OUT }),
                withSpring(1, SPRING)
            );
        }
    }, [focused, reduce, bounce]);

    const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value * press.value }] }));
    const color = focused ? theme.primary[500] : theme.colors.text.tertiary;

    // On web the tab is an <a href>; without preventDefault the browser does a
    // full page load. Modified clicks keep open-in-new-tab.
    const handlePress = (e) => {
        if (Platform.OS === 'web' && href) {
            if (hasModifierKey(e) || (e?.button != null && e.button !== 0)) return;
            e?.preventDefault?.();
        }
        onPress();
    };

    return (
        <View ref={tourRef} collapsable={false} style={styles.item}>
            <Pressable
                href={Platform.OS === 'web' ? href : undefined}
                onPress={handlePress}
                onLongPress={onLongPress}
                onHoverIn={preload}
                onPressIn={() => {
                    preload?.();
                    if (!reduce) press.value = withTiming(motion.scale.press, { duration: motion.duration.fast });
                }}
                onPressOut={() => {
                    press.value = reduce ? 1 : withSpring(1, SPRING);
                }}
                role="tab"
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                aria-selected={focused}
                accessibilityLabel={label}
                style={styles.pressable}
            >
                <Animated.View style={iconStyle}>
                    <Ionicons name={focused ? icon : `${icon}-outline`} size={22} color={color} />
                </Animated.View>
                <Text style={[styles.label, { color, fontWeight: focused ? '700' : '600' }]} numberOfLines={1}>
                    {label}
                </Text>
            </Pressable>
        </View>
    );
}

/**
 * Bottom tabs with a pill that springs to the selected tab and an icon that
 * bounces once on select.
 */
export default function AmpliTabBar({ state, descriptors, navigation, icons, preloads = {} }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const reduce = useReducedMotion();
    const insets = useSafeAreaInsets();
    const { buildHref } = useLinkBuilder();
    const [width, setWidth] = useState(0);
    const count = state.routes.length;
    const itemWidth = width / Math.max(count, 1);
    const pillX = useSharedValue(0);
    const ready = width > 0;

    useEffect(() => {
        if (!ready) return;
        const x = state.index * itemWidth + PILL_INSET;
        pillX.value = reduce ? x : withSpring(x, SPRING);
    }, [state.index, itemWidth, ready, reduce, pillX]);

    const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.value }] }));
    const pillColor = isDark ? 'rgba(235, 106, 28, 0.18)' : theme.primary[100];

    return (
        <View
            style={[
                styles.bar,
                {
                    backgroundColor: theme.colors.surfaceGlass,
                    borderTopColor: theme.colors.border,
                    paddingBottom: Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 8),
                },
                Platform.OS === 'web' && styles.webGlass,
            ]}
        >
            <View role="tablist" style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
                {ready && (
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.pill, { width: itemWidth - PILL_INSET * 2, backgroundColor: pillColor }, pillStyle]}
                    />
                )}
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const focused = index === state.index;
                    const label = options.tabBarLabel ?? options.title ?? route.name;
                    const onPress = () => {
                        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                        if (!focused && !event.defaultPrevented) {
                            navigation.dispatch({ ...CommonActions.navigate(route), target: state.key });
                        }
                    };
                    const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
                    return (
                        <TabItem
                            key={route.key}
                            route={route}
                            label={label}
                            icon={icons[route.name] || 'ellipse'}
                            focused={focused}
                            href={buildHref(route.name, route.params)}
                            onPress={onPress}
                            onLongPress={onLongPress}
                            preload={preloads[route.name]}
                            theme={theme}
                            reduce={reduce}
                        />
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        borderTopWidth: 1,
        paddingTop: 8,
        paddingHorizontal: 8,
    },
    webGlass: {
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
    },
    row: {
        flexDirection: 'row',
        height: 52,
    },
    pill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        borderRadius: 16,
    },
    item: {
        flex: 1,
    },
    pressable: {
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    label: {
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 0.1,
    },
});
