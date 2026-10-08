import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

// Where a recipe or photo came from, shown on every card that has one.
export type ContentSource = { kind: 'ai' } | { kind: 'user_photo' } | { kind: 'site'; site: string } | { kind: 'sample' };

export function sourceText(source: ContentSource): string {
    switch (source.kind) {
        case 'ai':
            return 'AI';
        case 'user_photo':
            return 'Your photo';
        case 'site':
            return `From ${source.site}`;
        case 'sample':
            return 'Sample · not AI';
    }
}

const ICONS = { ai: 'sparkles', user_photo: 'camera', site: 'link', sample: 'book' } as const;

export default function SourceLabel({ source, style }: { source: ContentSource; style?: StyleProp<ViewStyle> }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const color = theme.colors.text.secondary;
    return (
        <View
            style={[styles.pill, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }, style]}
            accessible
            accessibilityLabel={`Source: ${sourceText(source)}`}
        >
            <Ionicons name={ICONS[source.kind]} size={11} color={color} />
            <Text style={[styles.text, { color }]}>{sourceText(source)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
    text: { fontSize: 11, fontWeight: '700' },
});
