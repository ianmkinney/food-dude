import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useDesktopNavRoute } from '../../navigation/DesktopNavRouteContext';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import HeaderGoogleAccount from '../HeaderGoogleAccount';
import { desktopShellStyles } from './desktopTheme';

export default function DesktopHeader() {
    const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
    const { title } = useDesktopNavRoute();
    const { isDark, toggleTheme } = useTheme();
    const theme = getTheme(isDark);
    const c = theme.colors;

    return (
        <View style={[desktopShellStyles.header, { borderBottomColor: c.borderSoft, backgroundColor: c.background }]}>
            <View style={styles.spacer} />
            <HeaderGoogleAccount tintColor={c.text.primary} showSignInWhenUnconfigured />
            <Pressable
                onPress={toggleTheme}
                accessibilityRole="button"
                accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? c.surfaceMuted : 'transparent' }]}
            >
                <Ionicons name={isDark ? 'sunny' : 'moon'} size={22} color={c.text.primary} />
            </Pressable>
            <Pressable
                onPress={() => navigation.navigate('Account')}
                accessibilityRole="button"
                accessibilityLabel={`Open account settings. Current section: ${title}`}
                style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? c.surfaceMuted : 'transparent' }]}
            >
                <Ionicons name="person-circle-outline" size={26} color={c.text.primary} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    spacer: { flex: 1 },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
