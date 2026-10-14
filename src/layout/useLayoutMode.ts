import { useEffect, useMemo, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { isStandaloneDisplay, measureLargeViewportHeight, standaloneShellHeight } from './standaloneChrome';

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

/** Home-screen app: navigator.standalone, or display-mode standalone / fullscreen / minimal-ui. */
export function isWebStandalone(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { standalone?: boolean };
    return isStandaloneDisplay(nav.standalone === true, (mode) => {
        try {
            return window.matchMedia(`(display-mode: ${mode})`).matches;
        } catch {
            return false;
        }
    });
}

/** Unlock pinch-zoom and page scroll on laptop layouts only (web). */
export function useDesktopViewportUnlock(isDesktop: boolean) {
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return;

        const root = document.documentElement;
        const body = document.body;
        const appRoot = document.getElementById('root');
        const meta = document.querySelector('meta[name="viewport"]');
        let removePin = () => {};

        if (isDesktop) {
            root.classList.add('af-layout-wide');
            root.classList.remove('af-standalone');
            meta?.setAttribute('content', DESKTOP_VIEWPORT);
            body.style.position = 'static';
            body.style.overflow = 'auto';
            body.style.inset = '';
            root.style.height = '';
            root.style.maxHeight = '';
            body.style.height = '';
            body.style.maxHeight = '';
            if (appRoot) {
                appRoot.style.position = 'relative';
                appRoot.style.inset = '';
                appRoot.style.height = 'auto';
                appRoot.style.maxHeight = '';
                appRoot.style.minHeight = '100vh';
                appRoot.style.minHeight = '100dvh';
            }
        } else {
            root.classList.remove('af-layout-wide');
            const standalone = isWebStandalone();
            root.classList.toggle('af-standalone', standalone);
            meta?.setAttribute('content', MOBILE_VIEWPORT);
            body.style.position = 'fixed';
            body.style.overflow = 'hidden';
            body.style.inset = '0';
            body.style.margin = '0';
            if (appRoot) {
                appRoot.style.position = 'fixed';
                appRoot.style.inset = '0';
                appRoot.style.margin = '0';
            }
            if (standalone) {
                // visualViewport and 100dvh are ~100px short here (WebKit still
                // subtracts the Safari toolbar). Pin to 100lvh / screen height.
                const pinShell = () => {
                    const viewportHeight = window.visualViewport?.height || window.innerHeight;
                    const height = standaloneShellHeight({
                        viewportHeight,
                        largeHeight: measureLargeViewportHeight(document),
                        screenHeight: window.screen?.height || 0,
                        innerHeight: window.innerHeight,
                    });
                    const px = `${height}px`;
                    root.style.height = px;
                    root.style.minHeight = '0';
                    root.style.maxHeight = px;
                    body.style.top = '0';
                    body.style.bottom = 'auto';
                    body.style.padding = '0';
                    body.style.paddingBottom = '0';
                    body.style.marginBottom = '0';
                    body.style.height = px;
                    body.style.minHeight = '0';
                    body.style.maxHeight = px;
                    if (appRoot) {
                        appRoot.style.top = '0';
                        appRoot.style.bottom = 'auto';
                        appRoot.style.height = px;
                        appRoot.style.minHeight = '0';
                        appRoot.style.maxHeight = px;
                        appRoot.style.padding = '0';
                        appRoot.style.paddingBottom = '0';
                        appRoot.style.marginBottom = '0';
                    }
                };
                pinShell();
                const vv = window.visualViewport;
                vv?.addEventListener('resize', pinShell);
                window.addEventListener('orientationchange', pinShell);
                removePin = () => {
                    vv?.removeEventListener('resize', pinShell);
                    window.removeEventListener('orientationchange', pinShell);
                    root.style.height = '';
                    root.style.maxHeight = '';
                };
            } else if (appRoot) {
                root.style.height = '';
                root.style.maxHeight = '';
                body.style.height = '';
                body.style.maxHeight = '';
                body.style.bottom = '';
                appRoot.style.bottom = '';
                appRoot.style.height = '100vh';
                appRoot.style.height = '100dvh';
                appRoot.style.maxHeight = '';
                appRoot.style.minHeight = '';
            }
        }

        return () => {
            removePin();
            root.classList.remove('af-layout-wide');
            body.style.maxHeight = '';
            if (appRoot) appRoot.style.maxHeight = '';
        };
    }, [isDesktop]);
}
