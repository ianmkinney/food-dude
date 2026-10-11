import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from '../AnimatedPressable';
import PartyAvatar from './PartyAvatar';

export default function PartyMealCard({ meal, stats, theme, onPress }) {
    const recipeCount = meal.recipeIds?.length || 0;
    const total = stats?.totalIngredients || 0;
    const claimed = stats?.claimedCount || 0;
    const ratio = total > 0 ? claimed / total : 0;
    const contributors = stats?.contributors || [];

    return (
        <AnimatedPressable
            onPress={onPress}
            style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            accessibilityRole="button"
        >
            <View style={styles.top}>
                <Text style={[styles.title, { color: theme.colors.text.primary }]} numberOfLines={1}>
                    {meal.name}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.text.tertiary} />
            </View>
            {meal.description ? (
                <Text style={[styles.desc, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                    {meal.description}
                </Text>
            ) : null}
            <Text style={[styles.meta, { color: theme.colors.text.tertiary }]}>
                {recipeCount} recipe{recipeCount === 1 ? '' : 's'}
            </Text>
            {total > 0 ? (
                <View style={styles.progressBlock}>
                    <Text style={[styles.progressLabel, { color: theme.colors.text.secondary }]}>
                        {claimed}/{total} ingredients claimed
                    </Text>
                    <View style={[styles.track, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <View
                            style={[
                                styles.fill,
                                { width: `${Math.round(ratio * 100)}%`, backgroundColor: theme.primary[500] },
                            ]}
                        />
                    </View>
                </View>
            ) : null}
            {contributors.length > 0 ? (
                <View style={styles.contrib}>
                    {contributors.slice(0, 3).map((c) => (
                        <View key={c.recipeId} style={styles.contribRow}>
                            <PartyAvatar name={c.name} seed={c.memberId || c.name} size={22} theme={theme} />
                            <Text style={[styles.contribText, { color: theme.colors.text.tertiary }]} numberOfLines={1}>
                                {c.name} added {c.recipeTitle}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    card: {
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 16,
        borderWidth: 1,
        padding: 12,
        gap: 6,
    },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { flex: 1, fontSize: 17, fontWeight: '700' },
    desc: { fontSize: 14, lineHeight: 19 },
    meta: { fontSize: 13 },
    progressBlock: { gap: 4, marginTop: 4 },
    progressLabel: { fontSize: 12, fontWeight: '600' },
    track: { height: 6, borderRadius: 999, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 999 },
    contrib: { marginTop: 4, gap: 4 },
    contribRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    contribText: { flex: 1, fontSize: 12 },
});
