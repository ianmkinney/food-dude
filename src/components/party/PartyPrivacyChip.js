import React, { useEffect, useState } from 'react';
import { Modal, Text, View, StyleSheet, Pressable, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from '../AnimatedPressable';

const DISMISS_KEY = 'amplifood.party.privacyChipDismissed';
const ONE_LINE =
    'Parties sync online so friends can join — everything else stays on your phone.';

const DETAIL =
    'Parties and encrypted sync (when enabled) store kitchen data online; keys stay on your device.';

export default function PartyPrivacyChip({ theme }) {
    const [dismissed, setDismissed] = useState(false);
    const [showDetail, setShowDetail] = useState(false);

    useEffect(() => {
        AsyncStorage.getItem(DISMISS_KEY).then((v) => setDismissed(v === '1'));
    }, []);

    if (dismissed) return null;

    const dismiss = () => {
        setDismissed(true);
        AsyncStorage.setItem(DISMISS_KEY, '1');
    };

    return (
        <>
            <View style={[styles.chip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <AnimatedPressable onPress={() => setShowDetail(true)} style={styles.tap} accessibilityRole="button">
                    <Ionicons name="information-circle-outline" size={18} color={theme.primary[500]} />
                    <Text style={[styles.line, { color: theme.colors.text.secondary }]} numberOfLines={1}>
                        {ONE_LINE}
                    </Text>
                </AnimatedPressable>
                <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
                    <Ionicons name="close" size={18} color={theme.colors.text.tertiary} />
                </Pressable>
            </View>
            <Modal visible={showDetail} transparent animationType="fade" onRequestClose={() => setShowDetail(false)}>
                <Pressable style={styles.overlay} onPress={() => setShowDetail(false)}>
                    <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.title, { color: theme.colors.text.primary }]}>Party privacy</Text>
                        <ScrollView>
                            <Text style={{ color: theme.colors.text.secondary, lineHeight: 20 }}>{DETAIL}</Text>
                        </ScrollView>
                        <AnimatedPressable
                            onPress={() => setShowDetail(false)}
                            style={[styles.closeBtn, { backgroundColor: theme.primary[500] }]}
                        >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Got it</Text>
                        </AnimatedPressable>
                    </View>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    chip: {
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 8,
        minHeight: 36,
    },
    tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingVertical: 8 },
    line: { flex: 1, fontSize: 12 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
    sheet: { borderRadius: 16, padding: 20, maxHeight: '70%', gap: 12 },
    title: { fontSize: 18, fontWeight: '700' },
    closeBtn: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
