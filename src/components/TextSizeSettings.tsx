import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { TEXT_SIZE_OPTIONS, useTheme } from '../context/ThemeContext';

type Theme = ReturnType<typeof import('../theme').getTheme>;

/**
 * Text size for the whole app. The page itself can't be zoomed, so this is
 * how people enlarge text. Until a size is picked, AmpliFood follows the
 * device setting.
 */
export default function TextSizeSettings({ theme }: { theme: Theme }) {
    const { textSize, setTextSize, systemTextSize } = useTheme();
    const c = theme.colors;
    const selected = textSize ?? systemTextSize;
    const followingSystem = textSize == null;

    return (
        <View>
            <Text style={[styles.title, { color: c.text.primary }]} accessibilityRole="header">
                Text size
            </Text>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                {followingSystem
                    ? `Following your ${Platform.OS === 'web' ? 'browser' : 'device'} text size. Pick one to override it.`
                    : 'Changes every screen in AmpliFood.'}
            </Text>
            <View style={styles.options} accessibilityRole="radiogroup">
                {TEXT_SIZE_OPTIONS.map((option) => {
                    const active = option.id === selected;
                    return (
                        <Pressable
                            key={option.id}
                            onPress={() => setTextSize(option.id)}
                            style={[
                                styles.option,
                                {
                                    borderColor: active ? theme.primary[500] : c.border,
                                    backgroundColor: active ? theme.primary[500] + '1F' : c.surface,
                                },
                            ]}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: active }}
                            accessibilityLabel={`${option.label} text`}
                        >
                            <Text style={[styles.optionText, { color: active ? theme.primary[500] : c.text.primary }]}>
                                {option.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
            <Text style={[styles.preview, { color: c.text.primary, borderColor: c.border }]}>
                Simmer the sauce for 10 minutes, then fold in the basil.
            </Text>
            {!followingSystem && (
                <Pressable onPress={() => setTextSize(null)} style={styles.reset} accessibilityRole="button">
                    <Text style={[styles.resetText, { color: c.text.secondary }]}>
                        Use {Platform.OS === 'web' ? 'browser' : 'device'} setting
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
    body: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: {
        flexGrow: 1,
        flexBasis: '40%',
        minHeight: 44,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
    preview: { marginTop: 16, fontSize: 16, lineHeight: 24, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
    reset: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    resetText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
