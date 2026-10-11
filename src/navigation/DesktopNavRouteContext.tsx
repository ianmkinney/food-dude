import React, { createContext, useContext } from 'react';
import type { DesktopNavSnapshot } from './desktopNavRoute';

const DesktopNavRouteContext = createContext<DesktopNavSnapshot>({ activeKey: 'Ampi', title: 'Ampi' });

export function DesktopNavRouteProvider({
    value,
    children,
}: {
    value: DesktopNavSnapshot;
    children: React.ReactNode;
}) {
    return <DesktopNavRouteContext.Provider value={value}>{children}</DesktopNavRouteContext.Provider>;
}

export function useDesktopNavRoute() {
    return useContext(DesktopNavRouteContext);
}
