import { useEffect } from 'react';

declare global {
    interface Window {
        __ampliSplash?: { ready: () => void };
    }
}

/**
 * On web the splash is plain HTML in public/index.html so it paints before the
 * bundle arrives; this only tells it the app is ready to take over.
 */
export default function StartupSplash({ ready }: { ready: boolean; fontsLoaded?: boolean }) {
    useEffect(() => {
        if (ready) window.__ampliSplash?.ready();
    }, [ready]);
    return null;
}
