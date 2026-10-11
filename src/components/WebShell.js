import React from 'react';
import { Platform } from 'react-native';
import { useLayoutMode } from '../layout/useLayoutMode';
import MobileWebShell from './layout/MobileWebShell';
import DesktopWebShell from './layout/DesktopWebShell';

export default function WebShell({ children }) {
    const { usePhoneChrome } = useLayoutMode();

    if (Platform.OS !== 'web') {
        return children;
    }

    if (usePhoneChrome) {
        return <MobileWebShell>{children}</MobileWebShell>;
    }

    return <DesktopWebShell>{children}</DesktopWebShell>;
}
