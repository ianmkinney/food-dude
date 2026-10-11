import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useNavigationState, type NavigationProp } from '@react-navigation/native';
import { getTheme } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { BrandMark } from '../Brand';
import { ASSISTANT_NAME } from '../../config/assistant';
import { desktopShellStyles } from './desktopTheme';

type NavItem = {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    active: boolean;
};

type RootNav = NavigationProp<Record<string, object | undefined>>;

export default function DesktopSidebar() {
    const navigation = useNavigation<RootNav>();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const c = theme.colors;

    const activeKey = useNavigationState((state) => {
        const route = state.routes[state.index];
        if (route.name === 'Main' && route.state?.type === 'tab') {
            const tab = route.state.routes[route.state.index ?? 0];
            return tab?.name ?? ASSISTANT_NAME;
        }
        if (route.name === 'Party') return 'Party';
        if (route.name === 'Account') return 'Account';
        return route.name;
    });

    const items: NavItem[] = useMemo(
        () => [
            {
                key: ASSISTANT_NAME,
                label: ASSISTANT_NAME,
                icon: 'sparkles',
                active: activeKey === ASSISTANT_NAME,
                onPress: () => navigation.navigate('Main', { screen: ASSISTANT_NAME }),
            },
            {
                key: 'Recipes',
                label: 'Recipes',
                icon: 'book',
                active: activeKey === 'Recipes',
                onPress: () => navigation.navigate('Main', { screen: 'Recipes' }),
            },
            {
                key: 'Planner',
                label: 'Planner',
                icon: 'calendar',
                active: activeKey === 'Planner',
                onPress: () => navigation.navigate('Main', { screen: 'Planner' }),
            },
            {
                key: 'Grocery',
                label: 'Grocery',
                icon: 'cart',
                active: activeKey === 'Grocery',
                onPress: () => navigation.navigate('Main', { screen: 'Grocery' }),
            },
            {
                key: 'Pantry',
                label: 'Pantry',
                icon: 'cube',
                active: activeKey === 'Pantry',
                onPress: () => navigation.navigate('Main', { screen: 'Pantry' }),
            },
            {
                key: 'Party',
                label: 'Parties',
                icon: 'people',
                active: activeKey === 'Party',
                onPress: () => navigation.navigate('Party'),
            },
            {
                key: 'Account',
                label: 'Account',
                icon: 'person',
                active: activeKey === 'Account',
                onPress: () => navigation.navigate('Account'),
            },
        ],
        [navigation, activeKey]
    );

    return (
        <View
            style={[desktopShellStyles.sidebar, { borderRightColor: c.borderSoft, backgroundColor: c.surfaceMuted }]}
            accessibilityRole="menu"
            accessibilityLabel="Main"
        >
            <View style={desktopShellStyles.logoWrap}>
                <BrandMark variant="color" size={40} style={undefined} />
                <Text style={{ marginTop: 8, fontFamily: theme.typography.fonts.display, fontSize: 18, color: c.text.primary }}>
                    AmpliFood
                </Text>
            </View>
            {items.map((item) => {
                const color = item.active ? theme.primary[500] : c.text.secondary;
                return (
                    <Pressable
                        key={item.key}
                        onPress={item.onPress}
                        accessibilityRole="link"
                        accessibilityState={{ selected: item.active }}
                        accessibilityLabel={item.label}
                        style={({ pressed }) => [
                            desktopShellStyles.navItem,
                            item.active && {
                                backgroundColor: isDark ? 'rgba(235,106,28,0.14)' : theme.primary[50],
                                borderColor: c.borderSoft,
                            },
                            !item.active && pressed && { backgroundColor: c.surfaceMuted },
                        ]}
                    >
                        <Ionicons name={item.icon} size={20} color={color} />
                        <Text style={[desktopShellStyles.navLabel, { color }]}>{item.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
