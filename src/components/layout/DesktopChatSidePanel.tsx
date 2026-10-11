import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { AiDisclaimer, AllergenWarning, AllergyNotice } from '../../ai/AiLabel';
import { findAllergenMatches } from '../../safety/allergens';
import { useAllergies } from '../../safety/useAllergies';
import { ATTACHMENT_SOURCE_LABEL } from '../../sous/attachmentLimits';
import type { SousCard } from '../../sous/tools';
import { desktopAmpiStyles } from './desktopTheme';

type Nav = { navigate: (name: string, params?: object) => void };

type Props = {
    card: SousCard | null;
    navigation: Nav;
};

export default function DesktopChatSidePanel({ card, navigation }: Props) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const c = theme.colors;
    const allergies = useAllergies();
    const display = { fontFamily: theme.typography.fonts.display };

    return (
        <View style={[desktopAmpiStyles.sidePanel, { borderLeftColor: c.borderSoft, backgroundColor: c.surfaceMuted }]}>
            <Text style={[display, { fontSize: 16, color: c.text.primary, marginBottom: 8 }]} accessibilityRole="header">
                Context
            </Text>
            {!card ? (
                <Text style={{ color: c.text.tertiary, fontSize: 14, lineHeight: 20 }}>
                    When {`Ampi`} shares a recipe or grocery update, it appears here for a quick look.
                </Text>
            ) : (
                <ScrollView keyboardShouldPersistTaps="handled">
                    {renderCard(card, { c, theme, display, allergies, navigation })}
                </ScrollView>
            )}
        </View>
    );
}

function renderCard(
    card: SousCard,
    ctx: {
        c: ReturnType<typeof getTheme>['colors'];
        theme: ReturnType<typeof getTheme>;
        display: { fontFamily: string };
        allergies: ReturnType<typeof useAllergies>;
        navigation: Nav;
    }
) {
    const { c, theme, display, allergies, navigation } = ctx;
    const shell = {
        borderColor: c.border,
        backgroundColor: c.surface,
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 12,
    };

    switch (card.type) {
        case 'recipe':
            return (
                <Pressable
                    style={shell}
                    onPress={() => navigation.navigate('RecipeDetail', { recipeId: card.recipe.id })}
                    accessibilityRole="link"
                >
                    <Text style={{ color: c.text.tertiary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                        {card.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <Ionicons name="restaurant-outline" size={22} color={theme.primary[500]} />
                        <Text style={[display, { flex: 1, fontSize: 18, color: c.text.primary }]} numberOfLines={3}>
                            {card.recipe.title}
                        </Text>
                    </View>
                    <AllergenWarning matches={findAllergenMatches(card.ingredients || [], allergies.raw)} />
                    {card.aiGenerated ? (
                        <View style={{ marginTop: 12 }}>
                            <AiDisclaimer
                                kind="recipe"
                                report={{ kind: 'recipe', content: `${card.recipe.title}\n${(card.ingredients || []).join('\n')}` }}
                            />
                            <AllergyNotice allergies={allergies.list} />
                        </View>
                    ) : card.fromUserFile ? (
                        <Text style={{ color: c.text.tertiary, fontSize: 12, marginTop: 8 }}>{ATTACHMENT_SOURCE_LABEL}</Text>
                    ) : null}
                </Pressable>
            );
        case 'grocery':
        case 'pantry':
            return (
                <Pressable
                    style={shell}
                    onPress={() => navigation.navigate(card.type === 'pantry' ? 'Pantry' : 'Grocery')}
                    accessibilityRole="link"
                >
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                        <Ionicons
                            name={card.type === 'pantry' ? 'cube-outline' : 'cart-outline'}
                            size={22}
                            color={theme.primary[500]}
                        />
                        <Text style={{ flex: 1, color: c.text.primary, fontSize: 15, lineHeight: 22 }}>
                            {card.type === 'grocery' && card.action === 'removed'
                                ? `Cleared from grocery list: ${card.items.join(', ')}`
                                : `Added to ${card.type === 'pantry' ? 'pantry' : 'grocery list'}: ${card.items.join(', ')}`}
                        </Text>
                    </View>
                </Pressable>
            );
        default:
            return (
                <View style={shell}>
                    <Text style={{ color: c.text.secondary }}>Open the conversation to see full details.</Text>
                </View>
            );
    }
}
