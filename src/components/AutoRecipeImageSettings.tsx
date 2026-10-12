import React, { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View, StyleSheet } from 'react-native';
import {
    isAutoRecipeImageEnabled,
    setAutoRecipeImageEnabled,
} from '../settings/autoRecipeImageSettings';

type Theme = { colors: { text: { primary: string; secondary: string } }; primary: Record<number, string> };

export default function AutoRecipeImageSettings({ theme }: { theme: Theme }) {
    const [enabled, setEnabled] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        isAutoRecipeImageEnabled().then((v) => {
            setEnabled(v);
            setLoading(false);
        });
    }, []);

    const onToggle = useCallback(async (value: boolean) => {
        setEnabled(value);
        await setAutoRecipeImageEnabled(value);
    }, []);

    const c = theme.colors;

    return (
        <View style={styles.wrap}>
            <View style={styles.row}>
                <View style={styles.textCol}>
                    <Text style={[styles.title, { color: c.text.primary }]}>Auto-generate recipe images</Text>
                    <Text style={[styles.body, { color: c.text.secondary }]}>
                        When Ampi saves a recipe without a photo, generate a cover with your image model (Gemini on
                        OpenRouter or your BYOK settings). Skipped when you attach a photo.
                    </Text>
                </View>
                <Switch
                    value={enabled}
                    disabled={loading}
                    onValueChange={onToggle}
                    accessibilityLabel="Auto-generate recipe images"
                    trackColor={{ false: c.text.secondary, true: theme.primary[400] }}
                    thumbColor="#fff"
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 8, marginTop: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.1)' },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    textCol: { flex: 1, gap: 6 },
    title: { fontSize: 16, fontWeight: '600' },
    body: { fontSize: 14, lineHeight: 20 },
});
