import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchOwnerOpenRouterStats, type OwnerOpenRouterStats, type StatField } from '../platform/ownerStatsApi';

type Props = {
    theme: ReturnType<typeof import('../theme').getTheme>;
};

function formatUsd(field: StatField | null | undefined): string {
    if (!field) return '—';
    if ('error' in field) return field.error;
    if (field.value == null || !Number.isFinite(field.value)) return "Couldn't load";
    return `$${field.value.toFixed(2)}`;
}

function formatCount(field: StatField | null | undefined): string {
    if (!field) return '—';
    if ('error' in field) return field.error;
    if (field.value == null || !Number.isFinite(field.value)) return "Couldn't load";
    return String(Math.round(field.value));
}

function StatRow({
    label,
    field,
    theme,
    format = 'usd',
}: {
    label: string;
    field: StatField | null | undefined;
    theme: Props['theme'];
    format?: 'usd' | 'count';
}) {
    const failed = Boolean(field && 'error' in field);
    const value = format === 'count' ? formatCount(field) : formatUsd(field);
    return (
        <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.colors.text.secondary }]}>{label}</Text>
            <Text
                style={[styles.rowValue, { color: failed ? theme.colors.error : theme.colors.text.primary }]}
                numberOfLines={3}
            >
                {value}
            </Text>
        </View>
    );
}

export default function OwnerOpenRouterStatsCard({ theme }: Props) {
    const [stats, setStats] = useState<OwnerOpenRouterStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (refresh = false) => {
        setLoading(true);
        setError(null);
        try {
            const next = await fetchOwnerOpenRouterStats(refresh);
            setStats(next);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load OpenRouter stats.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(false);
    }, [load]);

    const c = theme.colors;
    const cachedLabel =
        stats && !loading
            ? stats.fromCache
                ? 'Showing cached stats (up to 1 min).'
                : `Updated ${new Date(stats.cachedAt).toLocaleTimeString()}.`
            : null;

    return (
        <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: c.text.primary }]}>OpenRouter usage</Text>
                <Pressable
                    onPress={() => load(true)}
                    disabled={loading}
                    style={[styles.refresh, { borderColor: c.border }]}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh OpenRouter stats"
                >
                    <Text style={{ color: theme.primary[500], fontWeight: '700' }}>{loading ? '…' : 'Refresh'}</Text>
                </Pressable>
            </View>
            {error ? (
                <Text style={[styles.hint, { color: theme.colors.error }]}>{error}</Text>
            ) : stats ? (
                <>
                    <StatRow label="Credit balance" field={stats.credits} theme={theme} />
                    <StatRow label="Spend today (UTC)" field={stats.spendToday} theme={theme} />
                    <StatRow label="Spend this week (UTC)" field={stats.spendThisWeek} theme={theme} />
                    <StatRow label="Spend this month (UTC)" field={stats.spendThisMonth} theme={theme} />
                    {stats.limit || stats.limitRemaining ? (
                        <View style={styles.row}>
                            <Text style={[styles.rowLabel, { color: c.text.secondary }]}>Key limit remaining</Text>
                            <Text style={[styles.rowValue, { color: c.text.primary }]}>
                                {formatUsd(stats.limitRemaining)} / {formatUsd(stats.limit)}
                            </Text>
                        </View>
                    ) : null}
                    {stats.callsThisWeek ? (
                        <StatRow label="API calls this week" field={stats.callsThisWeek} theme={theme} format="count" />
                    ) : stats.activityNote ? (
                        <Text style={[styles.hint, { color: c.text.tertiary }]}>{stats.activityNote}</Text>
                    ) : null}
                    {cachedLabel ? <Text style={[styles.hint, { color: c.text.tertiary }]}>{cachedLabel}</Text> : null}
                </>
            ) : (
                <Text style={[styles.hint, { color: c.text.secondary }]}>Loading…</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginTop: 4 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { fontSize: 16, fontWeight: '700', flex: 1 },
    refresh: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
    rowLabel: { fontSize: 14, flex: 1 },
    rowValue: { fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' },
    hint: { fontSize: 13, lineHeight: 18 },
});
