import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from '../AnimatedPressable';

export default function PartyActionBar({ theme, onInvite, onAddMeal, onOverflow, isOwner }) {
    return (
        <View style={styles.row}>
            <AnimatedPressable
                onPress={onInvite}
                style={[styles.btn, styles.primary, { backgroundColor: theme.primary[500] }]}
                accessibilityRole="button"
            >
                <Ionicons name="link-outline" size={18} color="#fff" />
                <Text style={styles.btnText}>Invite</Text>
            </AnimatedPressable>
            <AnimatedPressable
                onPress={onAddMeal}
                style={[styles.btn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                accessibilityRole="button"
            >
                <Ionicons name="restaurant-outline" size={18} color={theme.primary[500]} />
                <Text style={[styles.btnTextMuted, { color: theme.colors.text.primary }]}>Add meal</Text>
            </AnimatedPressable>
            {isOwner ? (
                <AnimatedPressable
                    onPress={onOverflow}
                    style={[styles.iconBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                    accessibilityRole="button"
                    accessibilityLabel="Party options"
                >
                    <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.text.primary} />
                </AnimatedPressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 8,
        alignItems: 'center',
    },
    btn: {
        flex: 1,
        minHeight: 44,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    primary: {},
    btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    btnTextMuted: { fontWeight: '600', fontSize: 15 },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
