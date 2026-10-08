import React from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import type { AllergenMatch } from '../safety/allergens';

// One look and one wording (approved by Legal Review) for everything a model
// produced. User photos, recipes imported from real pages and Open Food Facts
// data never get these.

export type AiContentKind = 'chat' | 'recipe' | 'estimate' | 'image';

const RECIPE_LEAD = 'AI-generated. Double-check before you cook.';
const RECIPE_BODY =
    'This recipe was made by AI and can be wrong. Check every ingredient and label for allergens, cook meat, poultry, eggs and seafood to safe temperatures, and treat nutrition and cost numbers as rough estimates, not medical or dietary advice.';
const ESTIMATE = 'Estimated by AI. May be inaccurate. Not medical or dietary advice.';
const CHAT = 'AI-generated and can be wrong. Not medical or dietary advice; check allergens yourself.';
const IMAGE = 'AI-generated image. The real dish will look different.';

export const aiDisclaimerFor = (kind: AiContentKind) =>
    kind === 'recipe' ? `${RECIPE_LEAD} ${RECIPE_BODY}` : kind === 'estimate' ? ESTIMATE : kind === 'image' ? IMAGE : CHAT;

// TODO(Ian): replace with the real support address (same as /support).
export const SUPPORT_EMAIL = 'support@amplifood.invalid';
const REPORTS_KEY = 'amplifood.aiReports.v1';

export type ReportTarget = { kind: AiContentKind | 'cost'; content: string };

export async function reportAiContent({ kind, content }: ReportTarget): Promise<void> {
    const report = { kind, content: content.slice(0, 4000), reportedAt: new Date().toISOString(), platform: Platform.OS };
    try {
        const existing = JSON.parse((await AsyncStorage.getItem(REPORTS_KEY)) || '[]') as unknown[];
        await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify([...existing, report].slice(-100)));
    } catch {
        // Saving locally is best effort; the email still opens.
    }
    const subject = `AmpliFood AI report (${kind})`;
    const body = `Tell us what was wrong, unsafe or offensive:\n\n\n---\nReported ${report.reportedAt} on ${report.platform}\nAI output:\n${report.content.slice(0, 1500)}`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
        await Linking.openURL(url);
    } catch {
        Alert.alert('Report saved', `Thanks. We saved this report on your device. You can also email ${SUPPORT_EMAIL}.`);
    }
}

export function ReportButton({ target }: { target: ReportTarget }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    return (
        <Pressable
            onPress={() => reportAiContent(target)}
            style={styles.report}
            accessibilityRole="button"
            accessibilityLabel="Report this AI response"
            hitSlop={8}
        >
            <Ionicons name="flag-outline" size={13} color={theme.colors.text.secondary} />
            <Text style={[styles.reportText, { color: theme.colors.text.secondary }]}>Report</Text>
        </Pressable>
    );
}

type BadgeProps = { style?: StyleProp<ViewStyle>; onDark?: boolean };

export function AiBadge({ style, onDark = false }: BadgeProps) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const fg = onDark ? '#FFFFFF' : theme.colors.text.secondary;
    const bg = onDark ? 'rgba(0,0,0,0.65)' : theme.colors.surfaceMuted;
    return (
        <View
            style={[styles.badge, { backgroundColor: bg, borderColor: onDark ? 'transparent' : theme.colors.border }, style]}
            accessible
            accessibilityRole="text"
            accessibilityLabel="AI-generated"
        >
            <Ionicons name="sparkles" size={11} color={fg} />
            <Text style={[styles.badgeText, { color: fg }]}>AI-generated</Text>
        </View>
    );
}

type DisclaimerProps = {
    kind: AiContentKind;
    style?: StyleProp<ViewStyle>;
    showBadge?: boolean;
    report?: ReportTarget;
};

export function AiDisclaimer({ kind, style, showBadge = true, report }: DisclaimerProps) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const color = theme.colors.text.secondary;
    return (
        <View style={[styles.row, style]}>
            {(showBadge || report) && (
                <View style={styles.badgeRow}>
                    {showBadge && <AiBadge />}
                    {report && <ReportButton target={report} />}
                </View>
            )}
            {kind === 'recipe' ? (
                <Text style={[styles.disclaimer, { color }]}>
                    <Text style={styles.bold}>{RECIPE_LEAD}</Text> {RECIPE_BODY}
                </Text>
            ) : (
                <Text style={[styles.disclaimer, { color }]}>{aiDisclaimerFor(kind)}</Text>
            )}
        </View>
    );
}

/** Shown on every AI recipe when the user has allergies set. */
export function AllergyNotice({ allergies, style }: { allergies: string[]; style?: StyleProp<ViewStyle> }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    if (!allergies.length) return null;
    return (
        <View style={[styles.notice, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }, style]}>
            <Ionicons name="alert-circle-outline" size={18} color={theme.colors.text.primary} />
            <Text style={[styles.noticeText, { color: theme.colors.text.primary }]}>
                <Text style={styles.bold}>Allergy check: you avoid {allergies.join(', ')}.</Text> AmpliFood asked the AI to leave these
                out, but AI can miss hidden ingredients (sauces, broths, spice blends, "natural flavors") and can't know about
                cross-contact. Read every label yourself, and if your allergy is severe, don't rely on this app to keep you safe.
            </Text>
        </View>
    );
}

/** Red banner above the ingredients when the on-device check finds a match. */
export function AllergenWarning({ matches, style }: { matches: AllergenMatch[]; style?: StyleProp<ViewStyle> }) {
    if (!matches.length) return null;
    const seen = new Set<string>();
    const parts = matches
        .filter((m) => (seen.has(m.allergen + m.ingredient) ? false : (seen.add(m.allergen + m.ingredient), true)))
        .map((m) => `${m.allergen} (${m.ingredient})`);
    return (
        <View style={[styles.warning, style]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Ionicons name="warning" size={20} color="#FFFFFF" />
            <Text style={styles.warningText}>
                <Text style={styles.bold}>Warning: this recipe may contain {parts.join(', ')}.</Text> Don't cook it as written. Remove
                or replace that ingredient, and check all labels.
            </Text>
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
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    row: { gap: 6 },
    disclaimer: { fontSize: 12.5, lineHeight: 18 },
    bold: { fontWeight: '800' },
    report: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
    reportText: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
    notice: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'flex-start' },
    noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
    warning: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 12, alignItems: 'flex-start', backgroundColor: '#B42318' },
    warningText: { flex: 1, color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
});
