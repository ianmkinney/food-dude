import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import AnimatedPressable from './AnimatedPressable';
import { Wordmark } from './Brand';
import HeaderGoogleAccount from './HeaderGoogleAccount';
import { useInstalledWebApp } from '../layout/useLayoutMode';
import { browserRefreshEnv, prepareAppRefresh } from '../layout/appRefresh';

// public/index.html flies the startup wordmark onto this element by id.
const HeaderTitle = () => {
    const installed = useInstalledWebApp();
    return <Wordmark height={installed ? 20 : 24} nativeID="af-header-logo" />;
};

const HeaderIconButton = ({ icon, onPress, label, color, compact = false }) => (
    <AnimatedPressable
        style={compact ? styles.headerButtonCompact : styles.headerButton}
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityRole="button"
        scaleTo={motion.scale.pressHard}
        hitSlop={compact ? { top: 2, bottom: 2, left: 4, right: 4 } : 8}
    >
        <Ionicons name={icon} size={compact ? 20 : 24} color={color} />
    </AnimatedPressable>
);

const RefreshAppButton = ({ color }) => {
    const [busy, setBusy] = useState(false);
    const onPress = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await prepareAppRefresh(browserRefreshEnv());
        } catch {
            // A failed update check still reloads the page the user asked for.
        }
        if (typeof window !== 'undefined') window.location.reload();
    };
    return (
        <AnimatedPressable
            style={styles.headerButtonCompact}
            onPress={onPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Refreshing' : 'Refresh app'}
            accessibilityState={{ busy }}
            testID="refresh-app"
            scaleTo={motion.scale.pressHard}
            hitSlop={{ top: 2, bottom: 2, left: 4, right: 4 }}
        >
            {busy ? (
                <ActivityIndicator size="small" color={color} />
            ) : (
                <Ionicons name="refresh" size={20} color={color} />
            )}
        </AnimatedPressable>
    );
};

export const HeaderPartyButton = ({ tintColor }) => {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    return (
        <View style={[styles.side, styles.leftSide]}>
            <HeaderIconButton
                icon="people"
                label="Open party"
                onPress={() => navigation.navigate('Party')}
                color={tintColor || theme.colors.text.primary}
            />
        </View>
    );
};

export const HeaderAccountActions = ({ tintColor }) => {
    const navigation = useNavigation();
    const { isDark, toggleTheme } = useTheme();
    const theme = getTheme(isDark);
    const installed = useInstalledWebApp();
    const color = tintColor || theme.colors.text.primary;
    return (
        <View style={[styles.side, styles.rightSide]}>
            <HeaderGoogleAccount tintColor={color} compact={installed} />
            {installed ? <RefreshAppButton color={color} /> : null}
            <HeaderIconButton
                icon={isDark ? 'sunny' : 'moon'}
                label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                onPress={toggleTheme}
                color={color}
                compact={installed}
            />
            <HeaderIconButton
                icon="person"
                label="Open account"
                onPress={() => navigation.navigate('Account')}
                color={color}
                compact={installed}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    side: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
    },
    leftSide: {
        marginLeft: 6,
    },
    rightSide: {
        marginRight: 6,
    },
    headerButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerButtonCompact: {
        width: 34,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default HeaderTitle;
