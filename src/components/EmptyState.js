import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getTheme, motion } from '../theme';
import GuitarMark from '../brand/GuitarMark';
import AnimatedPressable from './AnimatedPressable';
import { Enter } from '../motion';

/**
 * Real empty state: the guitar mascot sways and its waves pulse once, then a
 * title, one line of help and a primary action.
 */
export default function EmptyState({ title, description, actionLabel, onAction, secondaryLabel, onSecondary, style }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    return (
        <View style={[styles.wrap, style]}>
            <GuitarMark size={104} waves="once" sway />
            <Enter index={1} stagger={60} style={styles.copy}>
                <Text style={[styles.title, { color: theme.colors.text.primary, fontFamily: theme.typography.fonts.display }]} accessibilityRole="header">
                    {title}
                </Text>
                {!!description && <Text style={[styles.description, { color: theme.colors.text.secondary }]}>{description}</Text>}
            </Enter>
            {!!actionLabel && (
                <Enter index={2} stagger={60} style={styles.actions}>
                    <AnimatedPressable
                        onPress={onAction}
                        scaleTo={motion.scale.press}
                        style={[styles.primary, { backgroundColor: theme.primary[500] }]}
                        accessibilityRole="button"
                    >
                        <Text style={styles.primaryText}>{actionLabel}</Text>
                    </AnimatedPressable>
                    {!!secondaryLabel && (
                        <AnimatedPressable
                            onPress={onSecondary}
                            scaleTo={motion.scale.press}
                            style={[styles.secondary, { borderColor: theme.colors.border }]}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.secondaryText, { color: theme.colors.text.primary }]}>{secondaryLabel}</Text>
                        </AnimatedPressable>
                    )}
                </Enter>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 16 },
    copy: { alignItems: 'center', gap: 8 },
    title: { fontSize: 24, textAlign: 'center' },
    description: { fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 320 },
    actions: { alignSelf: 'stretch', alignItems: 'center', gap: 8, marginTop: 8 },
    primary: { minHeight: 48, paddingHorizontal: 24, borderRadius: 24, alignItems: 'center', justifyContent: 'center', minWidth: 220 },
    primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    secondary: { minHeight: 48, paddingHorizontal: 24, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minWidth: 220 },
    secondaryText: { fontSize: 16, fontWeight: '600' },
});
