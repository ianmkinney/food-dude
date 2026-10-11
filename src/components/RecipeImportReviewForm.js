import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Image,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { AiBadge, AiDisclaimer } from '../ai/AiLabel';

function normalizeIngredients(ingredients) {
    if (!Array.isArray(ingredients)) return [];
    return ingredients.map((row) =>
        typeof row === 'string'
            ? { ingredient: row, quantity: null, unit: null }
            : {
                  ingredient: row?.ingredient || '',
                  quantity: row?.quantity ?? null,
                  unit: row?.unit ?? null,
              }
    );
}

function normalizeInstructions(instructions) {
    if (!Array.isArray(instructions)) return [];
    return instructions.map((step) => String(step ?? ''));
}

/**
 * Editable preview of an imported recipe before saving to the recipe book.
 */
export default function RecipeImportReviewForm({
    recipe,
    onChange,
    onSave,
    saving = false,
    saveLabel = 'Save to Recipe Book',
}) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const draft = {
        ...recipe,
        ingredients: normalizeIngredients(recipe?.ingredients),
        instructions: normalizeInstructions(recipe?.instructions),
    };

    const update = (patch) => onChange({ ...draft, ...patch });

    const updateIngredient = (index, field, value) => {
        const next = [...draft.ingredients];
        next[index] = { ...next[index], [field]: value };
        update({ ingredients: next });
    };

    const updateInstruction = (index, value) => {
        const next = [...draft.instructions];
        next[index] = value;
        update({ instructions: next });
    };

    const addIngredient = () => update({ ingredients: [...draft.ingredients, { ingredient: '', quantity: null, unit: null }] });
    const addStep = () => update({ instructions: [...draft.instructions, ''] });

    const sourceUrl = draft.sourceUrl;
    const openSource = () => {
        if (sourceUrl) Linking.openURL(sourceUrl).catch(() => undefined);
    };

    return (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.titleRow}>
                <Text style={[styles.sectionHeading, { color: theme.colors.text.primary }]}>Review before saving</Text>
                {draft.aiExtracted ? <AiBadge /> : null}
            </View>
            {draft.aiExtracted ? <AiDisclaimer style={styles.aiDisclaimer} /> : null}

            {draft.imageUri ? (
                <Image source={{ uri: draft.imageUri }} style={styles.hero} accessibilityIgnoresInvertColors />
            ) : null}

            <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Title</Text>
            <TextInput
                accessibilityLabel="Recipe title"
                style={[styles.field, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                value={draft.title || ''}
                onChangeText={(title) => update({ title })}
            />

            {sourceUrl ? (
                <TouchableOpacity onPress={openSource} style={styles.sourceRow} accessibilityRole="link">
                    <Ionicons name="link-outline" size={18} color={theme.primary[600]} />
                    <Text style={[styles.sourceText, { color: theme.primary[600] }]} numberOfLines={2}>
                        {draft.sourcePlatform ? `${draft.sourcePlatform} · ` : ''}
                        {sourceUrl}
                    </Text>
                </TouchableOpacity>
            ) : null}

            <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Ingredients</Text>
            {draft.ingredients.map((ing, index) => (
                <View key={`ing-${index}`} style={styles.ingredientRow}>
                    <TextInput
                        accessibilityLabel={`Ingredient ${index + 1}`}
                        style={[styles.field, styles.ingredientField, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                        placeholder="Ingredient"
                        placeholderTextColor={theme.colors.text.tertiary}
                        value={ing.ingredient}
                        onChangeText={(v) => updateIngredient(index, 'ingredient', v)}
                    />
                </View>
            ))}
            <TouchableOpacity onPress={addIngredient} style={styles.addRow}>
                <Ionicons name="add-circle-outline" size={20} color={theme.primary[500]} />
                <Text style={[styles.addText, { color: theme.primary[600] }]}>Add ingredient</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Steps</Text>
            {draft.instructions.map((step, index) => (
                <View key={`step-${index}`} style={styles.stepRow}>
                    <Text style={[styles.stepNum, { color: theme.colors.text.tertiary }]}>{index + 1}.</Text>
                    <TextInput
                        accessibilityLabel={`Step ${index + 1}`}
                        style={[styles.field, styles.stepField, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                        multiline
                        value={step}
                        onChangeText={(v) => updateInstruction(index, v)}
                    />
                </View>
            ))}
            <TouchableOpacity onPress={addStep} style={styles.addRow}>
                <Ionicons name="add-circle-outline" size={20} color={theme.primary[500]} />
                <Text style={[styles.addText, { color: theme.primary[600] }]}>Add step</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.colors.success, opacity: saving ? 0.7 : 1 }]}
                onPress={() => onSave(draft)}
                disabled={saving}
                accessibilityRole="button"
            >
                <Ionicons name="save-outline" size={20} color="#FFF" />
                <Text style={styles.saveText}>{saveLabel}</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 24,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        gap: 8,
    },
    sectionHeading: {
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
    },
    aiDisclaimer: {
        marginBottom: 12,
    },
    hero: {
        width: '100%',
        height: 180,
        borderRadius: 12,
        marginBottom: 12,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: 12,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    field: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
    },
    sourceRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 8,
        marginBottom: 4,
    },
    sourceText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
    },
    ingredientRow: {
        marginBottom: 8,
    },
    ingredientField: {
        flex: 1,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 8,
    },
    stepNum: {
        fontSize: 16,
        fontWeight: '700',
        marginTop: 10,
        width: 22,
    },
    stepField: {
        flex: 1,
        minHeight: 44,
    },
    addRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    addText: {
        fontSize: 15,
        fontWeight: '600',
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 16,
    },
    saveText: {
        color: '#FFF',
        fontSize: 17,
        fontWeight: '700',
    },
});
