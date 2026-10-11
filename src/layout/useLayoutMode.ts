import { useEffect, useMemo, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

export const DESKTOP_MIN_WIDTH = 1024;
export const TABLET_MIN_WIDTH = 768;

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

function modeForWidth(width: number): LayoutMode {
    if (width >= DESKTOP_MIN_WIDTH) return 'desktop';
    if (width >= TABLET_MIN_WIDTH) return 'tablet';
    return 'mobile';
}

/** Single gate for responsive web layout. Mobile/tablet keep the phone shell unchanged. */
export function useLayoutMode() {
    const { width } = useWindowDimensions();
    const mode = useMemo(() => modeForWidth(width), [width]);
    return {
        mode,
        width,
        isMobile: mode === 'mobile',
        isTablet: mode === 'tablet',
        isDesktop: mode === 'desktop',
        /** Phone column + bottom tabs (mobile and tablet). */
        usePhoneChrome: mode !== 'desktop',
    };
}

const MOBILE_VIEWPORT =
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
const DESKTOP_VIEWPORT = 'width=device-width, initial-scale=1';

/** Unlock pinch-zoom and page scroll on laptop layouts only (web). */
export function useDesktopViewportUnlock(isDesktop: boolean) {
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return;

        const root = document.documentElement;
        const body = document.body;
        const appRoot = document.getElementById('root');
        const meta = document.querySelector('meta[name="viewport"]');

        if (isDesktop) {
            root.classList.add('af-layout-wide');
            meta?.setAttribute('content', DESKTOP_VIEWPORT);
            body.style.position = 'static';
            body.style.overflow = 'auto';
            body.style.inset = '';
            if (appRoot) {
                appRoot.style.position = 'relative';
                appRoot.style.inset = '';
                appRoot.style.height = 'auto';
                appRoot.style.minHeight = '100vh';
                appRoot.style.minHeight = '100dvh';
            }
        } else {
            root.classList.remove('af-layout-wide');
            meta?.setAttribute('content', MOBILE_VIEWPORT);
            body.style.position = 'fixed';
            body.style.overflow = 'hidden';
            body.style.inset = '0';
            if (appRoot) {
                appRoot.style.position = 'fixed';
                appRoot.style.inset = '0';
                appRoot.style.height = '100vh';
                appRoot.style.height = '100dvh';
                appRoot.style.minHeight = '';
            }
        }

        return () => {
            root.classList.remove('af-layout-wide');
        };
    }, [isDesktop]);
}
