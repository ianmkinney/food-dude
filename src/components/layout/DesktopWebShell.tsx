import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../theme';
import { useDesktopViewportUnlock, useLayoutMode } from '../../layout/useLayoutMode';

type Props = {
    children: React.ReactNode;
};

/** Full-width web shell for laptop viewports (chrome lives in DesktopNavigationFrame). */
export default function DesktopWebShell({ children }: Props) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const { isDesktop } = useLayoutMode();

    useDesktopViewportUnlock(isDesktop);

    return (
        <View style={{ flex: 1, width: '100%', backgroundColor: theme.colors.background }}>
            {children}
        </View>
    );
}
