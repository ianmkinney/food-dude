import React from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import AnimatedPressable from '../AnimatedPressable';

const GAP = 8;

export default function PartySwitcher({ parties, selectedId, theme, onSelect, onCreate }) {
    return (
        <View style={styles.row}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                {parties.map((party) => {
                    const active = party.id === selectedId;
                    return (
                        <AnimatedPressable
                            key={party.id}
                            onPress={() => onSelect(party)}
                            style={[
                                styles.chip,
                                {
                                    backgroundColor: active ? theme.primary[500] : theme.colors.surface,
                                    borderColor: active ? theme.primary[500] : theme.colors.border,
                                },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                        >
                            <Text
                                style={{
                                    color: active ? '#fff' : theme.colors.text.primary,
                                    fontWeight: active ? '700' : '500',
                                    fontSize: 14,
                                }}
                                numberOfLines={1}
                            >
                                {party.name}
                            </Text>
                        </AnimatedPressable>
                    );
                })}
                {parties.length === 0 ? (
                    <Text style={{ color: theme.colors.text.secondary, paddingVertical: 8 }}>No parties yet</Text>
                ) : null}
            </ScrollView>
            <AnimatedPressable
                onPress={onCreate}
                style={[styles.add, { backgroundColor: theme.primary[500] }]}
                accessibilityRole="button"
                accessibilityLabel="Create party"
            >
                <Text style={styles.addText}>+</Text>
            </AnimatedPressable>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: GAP, paddingHorizontal: 16, paddingTop: 8 },
    scroll: { gap: GAP, paddingRight: GAP, alignItems: 'center' },
    chip: {
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        borderWidth: 1,
        justifyContent: 'center',
        maxWidth: 160,
    },
    add: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addText: { color: '#fff', fontSize: 24, fontWeight: '600', marginTop: -2 },
});
