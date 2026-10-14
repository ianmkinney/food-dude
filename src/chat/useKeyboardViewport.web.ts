import { useEffect, useRef, useState } from 'react';
import { KEYBOARD_OPEN_GAP, measureLargeViewportHeight, standaloneShellHeight } from '../layout/standaloneChrome';
import { isWebStandalone } from '../layout/useLayoutMode';

// iOS Safari keeps the layout viewport at full screen height and pans the visual
// viewport over it when the keyboard opens. Pin #root to visualViewport (top +
// height, not 100vh/dvh) while the composer is focused so the composer sits on
// the form accessory bar with no gap or black strip below.

const KEYBOARD_MIN_PX = 80;

type Options = {
    /** App background — applied to html/body while pinned so nothing black shows through. */
    pageBackground?: string;
};

export function useKeyboardViewport(
    active: boolean,
    onChange?: () => void,
    options: Options = {}
): { keyboardOpen: boolean } {
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const onChangeRef = useRef(onChange);
    const pageBackgroundRef = useRef(options.pageBackground);
    onChangeRef.current = onChange;
    pageBackgroundRef.current = options.pageBackground;

    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
        const html = typeof document !== 'undefined' ? document.documentElement : null;
        const body = typeof document !== 'undefined' ? document.body : null;
        if (!active || !vv || !root || !html || !body) {
            setKeyboardOpen(false);
            return undefined;
        }

        const prevRoot = {
            position: root.style.position,
            top: root.style.top,
            left: root.style.left,
            right: root.style.right,
            width: root.style.width,
            bottom: root.style.bottom,
            height: root.style.height,
            maxHeight: root.style.maxHeight,
            overflow: root.style.overflow,
            transform: root.style.transform,
        };
        const prevHtmlOverflow = html.style.overflow;
        const prevBodyOverflow = body.style.overflow;
        const prevHtmlBg = html.style.backgroundColor;
        const prevBodyBg = body.style.backgroundColor;

        let frame = 0;
        const pinScroll = () => {
            if (window.scrollY !== 0 || window.scrollX !== 0) {
                window.scrollTo(0, 0);
            }
        };

        const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                pinScroll();
                const top = Math.max(0, vv.offsetTop);
                const layoutHeight = window.innerHeight || document.documentElement.clientHeight;
                const standalone = isWebStandalone();
                const largeHeight = standalone ? measureLargeViewportHeight(document) : 0;
                const height = standalone
                    ? standaloneShellHeight({
                          viewportHeight: vv.height,
                          largeHeight,
                          screenHeight: window.screen?.height || 0,
                          innerHeight: layoutHeight,
                      })
                    : vv.height;
                const open = standalone
                    ? Math.max(largeHeight, layoutHeight) - vv.height > KEYBOARD_OPEN_GAP
                    : layoutHeight - vv.height > KEYBOARD_MIN_PX;

                const bg = pageBackgroundRef.current;
                if (bg) {
                    html.style.backgroundColor = bg;
                    body.style.backgroundColor = bg;
                }
                html.style.overflow = 'hidden';
                body.style.overflow = 'hidden';

                root.style.position = 'fixed';
                root.style.left = '0';
                root.style.right = '0';
                root.style.width = '100%';
                root.style.top = `${top}px`;
                root.style.bottom = 'auto';
                root.style.height = `${height}px`;
                root.style.maxHeight = `${height}px`;
                root.style.overflow = 'hidden';
                root.style.transform = 'translateZ(0)';

                html.classList.toggle('af-keyboard-open', open);
                setKeyboardOpen(open);
                onChangeRef.current?.();
            });
        };

        update();
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        window.addEventListener('scroll', pinScroll, { passive: true });

        return () => {
            cancelAnimationFrame(frame);
            vv.removeEventListener('resize', update);
            vv.removeEventListener('scroll', update);
            window.removeEventListener('scroll', pinScroll);
            html.classList.remove('af-keyboard-open');
            document.documentElement.classList.remove('af-keyboard-open');
            root.style.position = prevRoot.position;
            root.style.top = prevRoot.top;
            root.style.left = prevRoot.left;
            root.style.right = prevRoot.right;
            root.style.width = prevRoot.width;
            root.style.bottom = prevRoot.bottom;
            root.style.height = prevRoot.height;
            root.style.maxHeight = prevRoot.maxHeight;
            root.style.overflow = prevRoot.overflow;
            root.style.transform = prevRoot.transform;
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prevBodyOverflow;
            html.style.backgroundColor = prevHtmlBg;
            body.style.backgroundColor = prevBodyBg;
            setKeyboardOpen(false);
        };
    }, [active]);

    return { keyboardOpen };
}
