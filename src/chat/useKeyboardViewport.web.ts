import { useEffect, useRef, useState } from 'react';

// iOS Safari doesn't resize the page for the on-screen keyboard: it shrinks
// and pans the *visual* viewport over the full-height app, which left the
// composer floating mid-screen with the tab bar and a gap below it. While the
// composer is focused, #root is pinned to the visual viewport (its top follows
// the pan, its height is what's left above the keyboard), so the composer sits
// directly on the keyboard and nothing scrolls behind it.

const KEYBOARD_MIN_PX = 120;

export function useKeyboardViewport(active: boolean, onChange?: () => void): { keyboardOpen: boolean } {
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
        if (!active || !vv || !root) {
            setKeyboardOpen(false);
            return undefined;
        }
        let frame = 0;
        const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
                const open = layoutHeight - vv.height > KEYBOARD_MIN_PX;
                root.style.top = `${Math.max(0, vv.offsetTop)}px`;
                root.style.bottom = 'auto';
                root.style.height = `${vv.height}px`;
                document.documentElement.classList.toggle('af-keyboard-open', open);
                setKeyboardOpen(open);
                onChangeRef.current?.();
            });
        };
        update();
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        return () => {
            cancelAnimationFrame(frame);
            vv.removeEventListener('resize', update);
            vv.removeEventListener('scroll', update);
            root.style.top = '';
            root.style.bottom = '';
            root.style.height = '';
            document.documentElement.classList.remove('af-keyboard-open');
        };
    }, [active]);

    return { keyboardOpen };
}
