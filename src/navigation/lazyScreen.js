import React, { Suspense, lazy } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getTheme } from '../theme';
import { Skeleton } from '../motion';

export function lazyScreen(loader) {
    let pending = null;
    const load = () => {
        pending = pending || loader();
        return pending;
    };
    const Lazy = lazy(() => load().then((mod) => ({ default: mod.default })));
    function LazyScreen(props) {
        return (
            <Suspense fallback={<ScreenFallback />}>
                <Lazy {...props} />
            </Suspense>
        );
    }
    // Start fetching the chunk early (e.g. on press-in) so the screen is ready
    // by the time navigation lands.
    LazyScreen.preload = () => {
        load().catch(() => {
            pending = null;
        });
    };
    return LazyScreen;
}

export function ScreenSkeleton({ rows = 4, hero = false, padded = true }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const base = theme.colors.surfaceMuted;
    const highlight = isDark ? 'rgba(255, 248, 236, 0.06)' : 'rgba(255, 255, 255, 0.7)';
    return (
        <View
            style={[styles.fallback, !padded && styles.flush, { backgroundColor: theme.colors.background }]}
            accessibilityRole="progressbar"
            accessibilityLabel="Loading"
        >
            {hero && <Skeleton base={base} highlight={highlight} height={220} radius={0} style={styles.hero} />}
            {Array.from({ length: rows }).map((_, i) => (
                <View key={i} style={[styles.card, { borderColor: theme.colors.borderSoft }]}>
                    <Skeleton base={base} highlight={highlight} width={56} height={56} radius={12} />
                    <View style={styles.lines}>
                        <Skeleton base={base} highlight={highlight} width="70%" height={14} />
                        <Skeleton base={base} highlight={highlight} width="45%" height={12} />
                    </View>
                </View>
            ))}
        </View>
    );
}

function ScreenFallback() {
    return <ScreenSkeleton />;
}

const styles = StyleSheet.create({
    fallback: { flex: 1, padding: 16, gap: 12 },
    flush: { padding: 0 },
    hero: { marginHorizontal: -16, marginTop: -16, marginBottom: 8 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, borderWidth: 1 },
    lines: { flex: 1, gap: 8 },
});
