import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AiBadge } from '../../ai/AiLabel';
import { runTools } from '../../sous/tools';
import { claimLiveIngredient } from '../../services/partyLiveSync';

export function PartyAmpiMessageExtras({
    message,
    theme,
    livePartyId,
    defaultLiveMealId,
    onMealsChanged,
    onAddRecipeToPartyMeal,
}) {
    const navigation = useNavigation();
    const c = theme.colors;
    const ampi = message.attachment?.ampi;
    const cards = ampi?.cards || [];
    const [busy, setBusy] = useState(null);

    if (!cards.length) return null;

    const saveDraft = async (card, index) => {
        if (!card.pendingAction) return;
        setBusy(index);
        try {
            await runTools([card.pendingAction]);
            onMealsChanged?.();
        } finally {
            setBusy(null);
        }
    };

    const addMissingToGrocery = async (card, index) => {
        const missing = card.missingIngredients || [];
        if (!missing.length) return;
        setBusy(index);
        try {
            await runTools([
                {
                    tool: 'add_to_grocery',
                    args: { items: missing.map((name) => ({ name })) },
                },
            ]);
        } finally {
            setBusy(null);
        }
    };

    const addMissingAsClaims = async (card, index) => {
        const missing = card.missingIngredients || [];
        const mealId = card.targetMealId || defaultLiveMealId;
        if (!missing.length || !livePartyId || !mealId) return;
        setBusy(index);
        try {
            for (const name of missing) {
                await claimLiveIngredient({
                    livePartyId,
                    mealSyncId: mealId,
                    recipeId: 'party_chat',
                    ingredientName: name,
                    registerOnly: true,
                });
            }
            onMealsChanged?.();
        } finally {
            setBusy(null);
        }
    };

    const addToParty = async (card, index) => {
        setBusy(index);
        try {
            let recipeId = card.recipeId;
            if (card.type === 'recipe_draft' && card.pendingAction) {
                const [saved] = await runTools([card.pendingAction]);
                recipeId = saved?.recipe?.id;
            }
            if (recipeId && onAddRecipeToPartyMeal) {
                await onAddRecipeToPartyMeal(recipeId, { saveOnly: false });
            }
            onMealsChanged?.();
        } finally {
            setBusy(null);
        }
    };

    return (
        <View style={styles.wrap}>
            {cards.map((card, index) => {
                if (card.type !== 'recipe_draft' && card.type !== 'recipe_saved') return null;
                const title = card.title || 'Recipe';
                const loading = busy === index;
                return (
                    <View
                        key={`${card.type}-${index}`}
                        style={[styles.card, { backgroundColor: c.background, borderColor: c.border }]}
                    >
                        <View style={styles.cardHeader}>
                            <Ionicons name="restaurant-outline" size={18} color={theme.primary[500]} />
                            <Text style={[styles.cardTitle, { color: c.text.primary }]}>{title}</Text>
                        </View>
                        <AiBadge />
                        {card.pantryLines?.length ? (
                            <View style={styles.pantryBlock}>
                                {card.pantryLines.map((line, li) => (
                                    <Text
                                        key={`${line.ingredient}-${li}`}
                                        style={{ color: c.text.secondary, fontSize: 13, lineHeight: 18 }}
                                    >
                                        {line.holders?.length
                                            ? `• ${line.ingredient}: ${line.holders
                                                  .map((h) => h.displayName)
                                                  .join(', ')}`
                                            : `• ${line.ingredient}: need to buy`}
                                    </Text>
                                ))}
                            </View>
                        ) : null}
                        {card.missingIngredients?.length ? (
                            <View style={styles.actions}>
                                <Pressable
                                    style={[styles.btn, { borderColor: c.border }]}
                                    disabled={loading}
                                    onPress={() => addMissingToGrocery(card, index)}
                                    accessibilityRole="button"
                                >
                                    <Text style={{ color: c.text.primary, fontWeight: '600' }}>
                                        Add missing to my grocery list
                                    </Text>
                                </Pressable>
                                {defaultLiveMealId ? (
                                    <Pressable
                                        style={[styles.btn, { borderColor: c.border }]}
                                        disabled={loading}
                                        onPress={() => addMissingAsClaims(card, index)}
                                        accessibilityRole="button"
                                    >
                                        <Text style={{ color: c.text.primary, fontWeight: '600' }}>
                                            Add missing as meal items to claim
                                        </Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        ) : null}
                        {card.type === 'recipe_saved' ? (
                            <Pressable
                                onPress={() => navigation.navigate('RecipeDetail', { recipeId: card.recipeId })}
                                accessibilityRole="link"
                            >
                                <Text style={{ color: theme.primary[600], fontWeight: '600' }}>View recipe</Text>
                            </Pressable>
                        ) : (
                            <View style={styles.actions}>
                                <Pressable
                                    style={[styles.btn, { borderColor: c.border }]}
                                    disabled={loading}
                                    onPress={() => saveDraft(card, index)}
                                    accessibilityRole="button"
                                >
                                    {loading ? (
                                        <ActivityIndicator size="small" color={theme.primary[500]} />
                                    ) : (
                                        <Text style={{ color: c.text.primary, fontWeight: '600' }}>Save to my recipes</Text>
                                    )}
                                </Pressable>
                                <Pressable
                                    style={[styles.btn, { backgroundColor: theme.primary[500], borderColor: theme.primary[500] }]}
                                    disabled={loading}
                                    onPress={() => addToParty(card, index)}
                                    accessibilityRole="button"
                                >
                                    <Text style={{ color: '#fff', fontWeight: '700' }}>Add to party meals</Text>
                                </Pressable>
                            </View>
                        )}
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginTop: 8, gap: 8, width: '100%' },
    card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 8 },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
    pantryBlock: { gap: 2 },
    actions: { gap: 6 },
    btn: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        alignItems: 'center',
    },
});
