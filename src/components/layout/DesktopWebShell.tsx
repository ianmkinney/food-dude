import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../theme';
import { useDesktopViewportUnlock, useLayoutMode } from '../../layout/useLayoutMode';
import { installDesktopScroll } from '../../platform/desktopScroll';
import DesktopHeader from './DesktopHeader';
import DesktopSidebar from './DesktopSidebar';
import { desktopShellStyles } from './desktopTheme';

type Props = {
    children: React.ReactNode;
};

export default function DesktopWebShell({ children }: Props) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const { isDesktop } = useLayoutMode();
    const mainRef = useRef<View>(null);

    useDesktopViewportUnlock(isDesktop);

    useEffect(() => {
        if (!isDesktop) return () => {};
        const node = mainRef.current as unknown as HTMLElement | null;
        return installDesktopScroll(node, { wide: true });
    }, [isDesktop]);

    return (
        <View style={[desktopShellStyles.root, { backgroundColor: theme.colors.surfaceMuted }]}>
            <DesktopSidebar />
            <View style={[desktopShellStyles.main, { backgroundColor: theme.colors.background }]}>
                <DesktopHeader />
                <View ref={mainRef} style={desktopShellStyles.content}>
                    <View style={desktopShellStyles.contentInner}>{children}</View>
                </View>
            </View>
        </View>
    );
}
