import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

// One look and one wording for everything a model produced. Content from the
// user (their photos, recipes imported from real pages, Open Food Facts data)
// never gets these.

export type AiContentKind = 'chat' | 'recipe' | 'nutrition' | 'cost' | 'image';

const DISCLAIMERS: Record<AiContentKind, string> = {
    chat: 'AI-generated and can be wrong. Not medical or dietary advice; check allergens yourself.',
    recipe: 'AI-generated recipe. Check ingredients for allergens and cook to safe temperatures. Not medical or dietary advice.',
    nutrition: 'AI-estimated nutrition, not measured. Not medical or dietary advice.',
    cost: 'AI-estimated prices. Real store prices will differ.',
    image: 'AI-generated image. The real dish will look different.',
};

export const aiDisclaimerFor = (kind: AiContentKind) => DISCLAIMERS[kind];

type BadgeProps = { style?: StyleProp<ViewStyle>; onDark?: boolean };

export function AiBadge({ style, onDark = false }: BadgeProps) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const fg = onDark ? '#FFFFFF' : theme.colors.text.secondary;
    const bg = onDark ? 'rgba(0,0,0,0.55)' : theme.colors.surfaceMuted;
    return (
        <View
            style={[styles.badge, { backgroundColor: bg, borderColor: onDark ? 'transparent' : theme.colors.border }, style]}
            accessibilityRole="text"
            accessibilityLabel="AI-generated"
        >
            <Ionicons name="sparkles" size={11} color={fg} />
            <Text style={[styles.badgeText, { color: fg }]}>AI-generated</Text>
        </View>
    );
}

type DisclaimerProps = { kind: AiContentKind; style?: StyleProp<ViewStyle>; showBadge?: boolean };

export function AiDisclaimer({ kind, style, showBadge = true }: DisclaimerProps) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    return (
        <View style={[styles.row, style]}>
            {showBadge && <AiBadge />}
            <Text style={[styles.disclaimer, { color: theme.colors.text.tertiary }]}>{DISCLAIMERS[kind]}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
    },
    badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
    row: { gap: 6 },
    disclaimer: { fontSize: 12, lineHeight: 17 },
});
