import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import DesktopGoogleSignIn from './DesktopGoogleSignIn';
import { desktopShellStyles } from './desktopTheme';

const ROUTE_TITLES: Record<string, string> = {
    Ampi: 'Ampi',
    Recipes: 'Recipe Book',
    Planner: 'Meal Planner',
    Pantry: 'My Pantry',
    Grocery: 'Grocery List',
    Party: 'Parties',
    Account: 'Account',
};

function resolveTitle(routeName: string | undefined, params: object | undefined) {
    if (!routeName) return 'AmpliFood';
    if (routeName === 'Main' && params && typeof params === 'object' && 'screen' in params) {
        const screen = (params as { screen?: string }).screen;
        if (screen && ROUTE_TITLES[screen]) return ROUTE_TITLES[screen];
    }
    return ROUTE_TITLES[routeName] ?? routeName;
}

export default function DesktopHeader() {
    const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
    const route = useRoute();
    const { isDark, toggleTheme } = useTheme();
    const theme = getTheme(isDark);
    const c = theme.colors;
    const title = resolveTitle(route.name, route.params);

    return (
        <View style={[desktopShellStyles.header, { borderBottomColor: c.borderSoft, backgroundColor: c.background }]}>
            <Text style={[desktopShellStyles.headerTitle, { color: c.text.primary, fontFamily: theme.typography.fonts.display }]}>
                {title}
            </Text>
            <DesktopGoogleSignIn theme={theme} />
            <Pressable
                onPress={toggleTheme}
                accessibilityRole="button"
                accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                style={({ pressed }) => [
                    styles.iconBtn,
                    {
                        backgroundColor: pressed ? c.surfaceMuted : 'transparent',
                    },
                ]}
            >
                <Ionicons name={isDark ? 'sunny' : 'moon'} size={22} color={c.text.primary} />
            </Pressable>
            <Pressable
                onPress={() => navigation.navigate('Account')}
                accessibilityRole="button"
                accessibilityLabel="Open account settings"
                style={({ pressed }) => [
                    styles.iconBtn,
                    {
                        backgroundColor: pressed ? c.surfaceMuted : 'transparent',
                    },
                ]}
            >
                <Ionicons name="person-circle-outline" size={26} color={c.text.primary} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
