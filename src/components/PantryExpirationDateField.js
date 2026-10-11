import React, { useMemo, useState } from 'react';
import { View, Text, Platform, Pressable, StyleSheet } from 'react-native';
import { createElement } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { parsePantryExpiration, pantryExpirationFromStorage } from '../utils/pantryExpiration';

/**
 * @param {{ value: string, onChange: (yyyyMmDd: string) => void, theme: object, label?: string }} props
 * value/onChange use YYYY-MM-DD or '' when unset.
 */
export default function PantryExpirationDateField({ value, onChange, theme, label = 'Expiration date' }) {
    const [showPicker, setShowPicker] = useState(false);
    const dateValue = useMemo(() => {
        const parsed = parsePantryExpiration(value);
        return parsed || new Date();
    }, [value]);

    const display = value ? pantryExpirationFromStorage(value) || value : 'No expiration date';

    const inputStyle = useMemo(
        () => ({
            width: '100%',
            height: 48,
            borderRadius: 8,
            paddingLeft: 16,
            paddingRight: 16,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            color: theme.colors.text.primary,
            fontSize: 16,
            fontFamily: 'inherit',
        }),
        [theme]
    );

    if (Platform.OS === 'web') {
        return (
            <View style={styles.block}>
                <Text style={[styles.label, { color: theme.colors.text.secondary }]}>{label}</Text>
                <View style={styles.webRow}>
                    {createElement('input', {
                        type: 'date',
                        'aria-label': label,
                        value: value || '',
                        onChange: (e) => onChange(e.target.value || ''),
                        style: inputStyle,
                    })}
                    {value ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Clear expiration date"
                            onPress={() => onChange('')}
                            style={[styles.clearBtn, { borderColor: theme.colors.border }]}
                        >
                            <Ionicons name="close-circle" size={22} color={theme.colors.text.tertiary} />
                        </Pressable>
                    ) : null}
                </View>
            </View>
        );
    }

    return (
        <View style={styles.block}>
            <Text style={[styles.label, { color: theme.colors.text.secondary }]}>{label}</Text>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => setShowPicker(true)}
                style={[
                    styles.nativeTrigger,
                    {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                    },
                ]}
            >
                <Ionicons name="calendar-outline" size={20} color={theme.primary[500]} />
                <Text style={[styles.nativeTriggerText, { color: theme.colors.text.primary }]}>{display}</Text>
            </Pressable>
            {value ? (
                <Pressable accessibilityRole="button" onPress={() => onChange('')} style={styles.clearLink}>
                    <Text style={{ color: theme.primary[600], fontWeight: '600' }}>Clear expiration</Text>
                </Pressable>
            ) : null}
            {showPicker ? (
                <DateTimePicker
                    value={dateValue}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selected) => {
                        if (Platform.OS === 'android') setShowPicker(false);
                        if (event.type === 'dismissed') {
                            setShowPicker(false);
                            return;
                        }
                        if (selected) {
                            const y = selected.getFullYear();
                            const m = String(selected.getMonth() + 1).padStart(2, '0');
                            const d = String(selected.getDate()).padStart(2, '0');
                            onChange(`${y}-${m}-${d}`);
                        }
                    }}
                />
            ) : null}
            {showPicker && Platform.OS === 'ios' ? (
                <Pressable onPress={() => setShowPicker(false)} style={styles.iosDone}>
                    <Text style={{ color: theme.primary[600], fontWeight: '700' }}>Done</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    block: { gap: 8 },
    label: { fontSize: 14, fontWeight: '500' },
    webRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    clearBtn: {
        width: 44,
        height: 44,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nativeTrigger: {
        minHeight: 48,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    nativeTriggerText: { fontSize: 16, flex: 1 },
    clearLink: { alignSelf: 'flex-start', paddingVertical: 4 },
    iosDone: { alignSelf: 'flex-end', paddingVertical: 8 },
});
