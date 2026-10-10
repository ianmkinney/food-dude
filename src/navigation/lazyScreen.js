import React, { Suspense, lazy, useEffect, useState } from 'react';
import { View } from 'react-native';
import ScreenSkeleton from '../components/Skeleton';
import { SKELETON_DELAY } from '../data/queryCache';

function DelayedSkeleton() {
    const [show, setShow] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setShow(true), SKELETON_DELAY);
        return () => clearTimeout(t);
    }, []);
    return show ? <ScreenSkeleton /> : <View style={{ flex: 1 }} />;
}

export function lazyScreen(loader) {
    let promise;
    const load = () => {
        if (!promise) promise = loader().then((mod) => ({ default: mod.default }));
        return promise;
    };
    const Lazy = lazy(load);
    function LazyScreen(props) {
        return (
            <Suspense fallback={<DelayedSkeleton />}>
                <Lazy {...props} />
            </Suspense>
        );
    }
    LazyScreen.preload = () => load().catch(() => undefined);
    return LazyScreen;
}
