import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getTheme } from '../theme';

/** On wide web viewports, keep the app in a centered phone-width column. */
export default function WebShell({ children }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    if (Platform.OS !== 'web') {
        return children;
    }

    return (
        <View style={[styles.outer, { backgroundColor: theme.colors.surfaceMuted }]}>
            <View style={[styles.inner, { backgroundColor: theme.colors.background }]}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    outer: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
    },
    inner: {
        flex: 1,
        width: '100%',
        maxWidth: 480,
    },
});
