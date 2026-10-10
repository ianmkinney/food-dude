import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Rise } from '../motion';
import AnimatedPressable from './AnimatedPressable';
import GuitarMark from './GuitarMark';

type Action = { label: string; onPress: () => void };

/** Empty list: the guitar mascot sways, its waves pulse once, one clear next step. */
export default function EmptyState({
    title,
    description,
    primary,
    secondary,
}: {
    title: string;
    description?: string;
    primary?: Action;
    secondary?: Action;
}) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const c = theme.colors;
    return (
        <View style={styles.root}>
            <GuitarMark size={112} sway waves="once" waveDelay={200} />
            <Rise index={1}>
                <Text style={[styles.title, { color: c.text.primary, fontFamily: theme.typography.fonts.display }]} accessibilityRole="header">
                    {title}
                </Text>
            </Rise>
            {description ? (
                <Rise index={2}>
                    <Text style={[styles.description, { color: c.text.secondary }]}>{description}</Text>
                </Rise>
            ) : null}
            {primary ? (
                <Rise index={3} style={styles.actions}>
                    <AnimatedPressable
                        style={[styles.button, { backgroundColor: theme.primary[500] }]}
                        onPress={primary.onPress}
                        accessibilityRole="button"
                    >
                        <Text style={styles.buttonText}>{primary.label}</Text>
                    </AnimatedPressable>
                    {secondary ? (
                        <AnimatedPressable
                            style={[styles.button, styles.secondary, { borderColor: c.border }]}
                            onPress={secondary.onPress}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.buttonText, { color: c.text.primary }]}>{secondary.label}</Text>
                        </AnimatedPressable>
                    ) : null}
                </Rise>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48, gap: 8 },
    title: { fontSize: 24, marginTop: 16, textAlign: 'center' },
    description: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
    actions: { marginTop: 16, gap: 8, alignSelf: 'stretch', alignItems: 'center' },
    button: { minHeight: 48, minWidth: 220, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    secondary: { borderWidth: 1, backgroundColor: 'transparent' },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
