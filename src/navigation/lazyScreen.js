import React, { Suspense, lazy } from 'react';
import ScreenSkeleton from '../components/Skeleton';

export function lazyScreen(loader) {
    const Lazy = lazy(() => loader().then((mod) => ({ default: mod.default })));
    return function LazyScreen(props) {
        return (
            <Suspense fallback={<ScreenSkeleton />}>
                <Lazy {...props} />
            </Suspense>
        );
    };
}
