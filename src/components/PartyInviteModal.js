import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    Modal,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { buildPartyJoinLink } from '../services/partySync/join';
import { buildPartyExportDocument } from '../services/partySync/model';
import { partyMealOperations, partyMemberOperations, partyOperations } from '../database/operations';
import {
    buildInviteMail,
    openMailtoFallback,
    sendPartyEmailViaApi,
    shareLink,
} from '../services/partyEmail';

async function loadBundle(partyId) {
    const party = await partyOperations.getById(partyId);
    const members = await partyMemberOperations.getByPartyId(partyId);
    const meals = await partyMealOperations.getByPartyId(partyId);
    return { party, members, meals };
}

export default function PartyInviteModal({ visible, onClose, theme, selectedParty, currentUser, onUpdated }) {
    const [joinLink, setJoinLink] = useState('');
    const [busy, setBusy] = useState(false);
    const [optionalEmail, setOptionalEmail] = useState('');

    useEffect(() => {
        if (!visible || !selectedParty) return;
        let cancelled = false;
        (async () => {
            setBusy(true);
            try {
                const bundle = await loadBundle(selectedParty.id);
                let secret = bundle.party.sync_secret;
                if (!secret) {
                    const { generateSyncSecret } = await import('../services/partySync');
                    secret = generateSyncSecret();
                    await partyOperations.setSyncSecret(selectedParty.id, secret);
                }
                const link = await buildPartyJoinLink(bundle.party, bundle.members, bundle.meals, secret);
                if (!cancelled) setJoinLink(link);
            } catch (error) {
                if (!cancelled) Alert.alert('Error', error?.message || 'Could not build invite link');
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [visible, selectedParty?.id]);

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

    const sendOptionalEmail = async () => {
        const email = optionalEmail.trim().toLowerCase();
        if (!email || !joinLink) return;
        setBusy(true);
        try {
            const bundle = await loadBundle(selectedParty.id);
            const doc = buildPartyExportDocument(bundle.party, bundle.members, bundle.meals);
            const partyMembers = bundle.members
                .map((m) => ({
                    email: (m.member_email || '').toLowerCase(),
                    name: m.user_name,
                }))
                .filter((m) => m.email);
            if (!partyMembers.some((m) => m.email === email)) {
                partyMembers.push({ email, name: email });
            }
            const actorName = currentUser?.name || currentUser?.username || 'A friend';
            const apiResult = await sendPartyEmailViaApi({
                kind: 'invite',
                to: [email],
                partyMembers,
                partyName: selectedParty.name,
                shareLink: joinLink,
                actorName,
            });
            if (!apiResult.ok) {
                const mail = buildInviteMail({ partyName: selectedParty.name, actorName, shareLink: joinLink });
                await openMailtoFallback({ to: [email], subject: mail.subject, body: mail.body });
            }
            setOptionalEmail('');
            Alert.alert('Sent', `Invite prepared for ${email}.`);
            onUpdated?.();
        } catch (error) {
            Alert.alert('Error', error?.message || 'Could not send email');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.title, { color: theme.colors.text.primary }]}>Invite to party</Text>
                    <Text style={[styles.note, { color: theme.colors.text.secondary }]}>
                        Share the join link (copy or share sheet). Membership syncs via links and optional email —
                        nothing is stored on our servers.
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
                    <Text style={[styles.optionalLabel, { color: theme.colors.text.secondary }]}>Optional email</Text>
                    <TextInput
                        style={[styles.input, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                        placeholder="friend@example.com"
                        placeholderTextColor={theme.colors.text.tertiary}
                        value={optionalEmail}
                        onChangeText={setOptionalEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                    <View style={styles.row}>
                        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.border }]} onPress={onClose}>
                            <Text style={[styles.btnText, { color: theme.colors.text.primary }]}>Done</Text>
                        </TouchableOpacity>
                        {optionalEmail.trim() ? (
                            <TouchableOpacity
                                style={[styles.btn, { backgroundColor: theme.accent.purple }]}
                                onPress={sendOptionalEmail}
                            >
                                <Text style={styles.btnText}>Email link</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
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
    optionalLabel: { fontSize: 13, marginTop: 12, marginBottom: 6 },
    input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
});
