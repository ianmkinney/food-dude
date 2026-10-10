import React, { Suspense, lazy } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function lazyScreen(loader) {
    const Lazy = lazy(() => loader().then((mod) => ({ default: mod.default })));
    return function LazyScreen(props) {
        return (
            <Suspense fallback={<ScreenFallback />}>
                <Lazy {...props} />
            </Suspense>
        );
    };
}

function ScreenFallback() {
    return (
        <View style={styles.fallback}>
            <ActivityIndicator size="large" />
        </View>
    );
}

const styles = StyleSheet.create({
    fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
