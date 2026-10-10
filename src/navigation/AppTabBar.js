import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { getTheme, motion } from '../theme';
import { useTourTarget } from '../onboarding/tourTargets';
import { useReducedMotion } from '../motion';

const PILL_WIDTH = 56;
const PILL_HEIGHT = 32;
// Labels grow with the text size control, but are capped so five tabs still fit.
const LABEL_MAX_SCALE = 1.15;

function TabItem({ route, label, icon, focused, onPress, onLongPress, theme, reduceMotion }) {
    const tourRef = useTourTarget(`tab-${route.name}`);
    const bounce = useSharedValue(1);

    useEffect(() => {
        if (!focused || reduceMotion) return;
        bounce.value = withSequence(
            withTiming(1.18, { duration: motion.duration.fast }),
            withSpring(1, motion.spring.base)
        );
    }, [focused, reduceMotion, bounce]);

    const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }] }));
    const color = focused ? theme.primary[500] : theme.colors.text.tertiary;

    return (
        <View ref={tourRef} collapsable={false} style={styles.item}>
            <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                style={styles.pressable}
            >
                <Animated.View style={[styles.iconWrap, iconStyle]}>
                    <Ionicons name={focused ? icon : `${icon}-outline`} size={22} color={color} />
                </Animated.View>
                <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={LABEL_MAX_SCALE}
                    style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]}
                >
                    {label}
                </Text>
            </Pressable>
        </View>
    );
}

/** Bottom tab bar with a pill that springs to the selected tab. */
export default function AppTabBar({ state, descriptors, navigation, icons }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const insets = useSafeAreaInsets();
    const reduceMotion = useReducedMotion();
    const [width, setWidth] = useState(0);
    const tabWidth = width / state.routes.length;
    const pillX = useSharedValue(0);
    const ready = width > 0;

    useEffect(() => {
        if (!ready) return;
        const target = state.index * tabWidth + (tabWidth - PILL_WIDTH) / 2;
        pillX.value = reduceMotion ? target : withSpring(target, motion.spring.base);
    }, [state.index, tabWidth, ready, reduceMotion, pillX]);

    const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.value }] }));

    return (
        <View
            accessibilityRole="tablist"
            style={[
                styles.bar,
                {
                    paddingBottom: Math.max(insets.bottom, 8),
                    backgroundColor: theme.colors.surfaceGlass,
                    borderTopColor: theme.colors.borderSoft,
                },
                Platform.OS === 'web' && styles.webBlur,
            ]}
        >
            <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
                {ready && (
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.pill, { backgroundColor: isDark ? 'rgba(235,106,28,0.18)' : theme.primary[100] }, pillStyle]}
                    />
                )}
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const label = options.tabBarLabel ?? options.title ?? route.name;
                    const focused = state.index === index;
                    const onPress = () => {
                        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                        if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
                    };
                    const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
                    return (
                        <TabItem
                            key={route.key}
                            route={route}
                            label={label}
                            icon={icons[route.name] || 'help-circle'}
                            focused={focused}
                            onPress={onPress}
                            onLongPress={onLongPress}
                            theme={theme}
                            reduceMotion={reduceMotion}
                        />
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
    webBlur: { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' },
    row: { flexDirection: 'row' },
    item: { flex: 1 },
    pressable: { minHeight: 52, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2, gap: 2 },
    iconWrap: { width: PILL_WIDTH, height: PILL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    pill: { position: 'absolute', top: 2, left: 0, width: PILL_WIDTH, height: PILL_HEIGHT, borderRadius: PILL_HEIGHT / 2 },
    label: { fontSize: 11, lineHeight: 14 },
});
