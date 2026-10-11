import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { shareLink } from '../services/partyEmail';
import { buildLiveInviteUrl } from '../services/partyLiveSync';

export default function PartyInviteModal({ visible, onClose, theme, selectedParty }) {
    const [joinLink, setJoinLink] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!visible || !selectedParty) return;
        let cancelled = false;
        (async () => {
            setBusy(true);
            try {
                const token = selectedParty.live_invite_token;
                if (!token) {
                    throw new Error('Invite link is not ready yet. Try again in a moment.');
                }
                if (!cancelled) setJoinLink(buildLiveInviteUrl(token));
            } catch (error) {
                if (!cancelled) Alert.alert('Error', error?.message || 'Could not build invite link');
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [visible, selectedParty?.id, selectedParty?.live_invite_token]);

    const copyLink = async () => {
        if (!joinLink) return;
        await Clipboard.setStringAsync(joinLink);
        Alert.alert('Copied', 'Join link copied to clipboard.');
    };

    const shareJoinLink = async () => {
        if (!joinLink) return;
        await shareLink({
            title: `Join ${selectedParty.name}`,
            message: `Join my AmpliFood party "${selectedParty.name}":`,
            url: joinLink,
        });
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.title, { color: theme.colors.text.primary }]}>Invite to party</Text>
                    <Text style={[styles.note, { color: theme.colors.text.secondary }]}>
                        Share this link so friends can join. They need to sign in with Google using the same link.
                    </Text>
                    {busy ? (
                        <ActivityIndicator style={{ marginVertical: 16 }} />
                    ) : (
                        <ScrollView>
                            <Text selectable style={[styles.link, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}>
                                {joinLink || '…'}
                            </Text>
                        </ScrollView>
                    )}
                    <View style={styles.row}>
                        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary[500] }]} onPress={copyLink}>
                            <Ionicons name="copy-outline" size={18} color="#fff" />
                            <Text style={styles.btnText}>Copy link</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.accent.green }]} onPress={shareJoinLink}>
                            <Ionicons name="share-outline" size={18} color="#fff" />
                            <Text style={styles.btnText}>Share</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.border, marginTop: 8 }]} onPress={onClose}>
                        <Text style={[styles.btnText, { color: theme.colors.text.primary }]}>Done</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    card: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
    title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
    note: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
    link: { fontSize: 12, padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 12 },
    row: { flexDirection: 'row', gap: 8, marginTop: 8 },
    btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 8 },
    btnText: { color: '#fff', fontWeight: '600' },
});
