import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../theme';
import { installDesktopScroll } from '../../platform/desktopScroll';

/** Unchanged phone-width column for mobile and tablet web viewports. */
export default function MobileWebShell({ children }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const columnRef = useRef(null);

    useEffect(() => installDesktopScroll(columnRef.current), []);

    return (
        <View style={[styles.outer, { backgroundColor: theme.colors.surfaceMuted }]}>
            <View ref={columnRef} style={[styles.inner, { backgroundColor: theme.colors.background }]}>
                {children}
            </View>
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
