import React from 'react';
import { View } from 'react-native';
import { useLayoutMode } from '../layout/useLayoutMode';
import DesktopHeader from '../components/layout/DesktopHeader';
import DesktopSidebar from '../components/layout/DesktopSidebar';
import { desktopShellStyles } from '../components/layout/desktopTheme';
import { DesktopNavRouteProvider } from './DesktopNavRouteContext';
import type { DesktopNavSnapshot } from './desktopNavRoute';

type Props = {
    children: React.ReactNode;
    navRoute: DesktopNavSnapshot;
};

/** Sidebar + top header; must render inside NavigationContainer. */
export default function DesktopNavigationFrame({ children, navRoute }: Props) {
    const { isDesktop } = useLayoutMode();

    if (!isDesktop) {
        return children;
    }

    return (
        <DesktopNavRouteProvider value={navRoute}>
            <View style={desktopShellStyles.root}>
                <DesktopSidebar />
                <View style={desktopShellStyles.main}>
                    <DesktopHeader />
                    <View style={desktopShellStyles.content}>
                        <View style={desktopShellStyles.contentInner}>{children}</View>
                    </View>
                </View>
            </View>
        </DesktopNavRouteProvider>
    );
}
