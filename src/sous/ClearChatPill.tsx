import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

type Props = {
    onPress: () => void;
    style?: ViewStyle;
};

/** Compact labeled control for clearing the Ampi thread (44px min tap target). */
export default function ClearChatPill({ onPress, style }: Props) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const c = theme.colors;
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Clear chat"
            style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                style,
            ]}
        >
            <Ionicons name="trash-outline" size={18} color={c.text.secondary} />
            <Text style={[styles.label, { color: c.text.secondary }]}>Clear chat</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minHeight: 44,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
    },
    label: { fontSize: 14, fontWeight: '600' },
});
