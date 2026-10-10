import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
    buildPartyExportDocument,
    buildShareLinkForPayload,
    summarizePartyChanges,
} from '../services/partySync';
import { applyPartyDocument } from '../services/partySync/apply';
import {
    buildBroadcastMail,
    buildMemberUpdateMail,
    openMailtoFallback,
    sendPartyEmailViaApi,
    shareLink,
} from '../services/partyEmail';
import { partyMealOperations, partyMemberOperations, partyOperations } from '../database/operations';
import PartyMembersList from './PartyMembersList';

async function loadPartyBundle(partyId) {
    const party = await partyOperations.getById(partyId);
    const members = await partyMemberOperations.getByPartyId(partyId);
    const meals = await partyMealOperations.getByPartyId(partyId);
    return { party, members, meals };
}

export default function PartySyncPanel({
    theme,
    selectedParty,
    currentUser,
    partyMembers,
    onPartyUpdated,
    pendingImport,
    onClearPendingImport,
}) {
    const [reviewLines, setReviewLines] = useState([]);
    const [busy, setBusy] = useState(false);

    const viewerEmail = (currentUser?.email || '').toLowerCase();
    const ownerEmail = (selectedParty?.owner_email || '').toLowerCase();
    const isOwner =
        partyMembers?.some((m) => m.role === 'owner' && m.user_id === currentUser?.user_id) ||
        (viewerEmail && ownerEmail && viewerEmail === ownerEmail);
    const syncVersion = selectedParty?.sync_version ?? 1;

    const ensureSecret = async () => {
        if (selectedParty?.sync_secret) return selectedParty.sync_secret;
        const { generateSyncSecret } = await import('../services/partySync');
        const secret = generateSyncSecret();
        await partyOperations.setSyncSecret(selectedParty.id, secret);
        return secret;
    };

    const buildExport = useCallback(
        async (options = {}) => {
            const bundle = await loadPartyBundle(selectedParty.id);
            const secret = bundle.party.sync_secret || await ensureSecret();
            const doc = buildPartyExportDocument(bundle.party, bundle.members, bundle.meals, {
                proposal: options.proposal,
                proposedBy: options.proposedBy,
            });
            if (options.touchUpdatedAt) {
                doc.updatedAt = Date.now();
            }
            const link = await buildShareLinkForPayload(doc, secret, { stripHeavy: true });
            return { doc, link, secret, members: bundle.members };
        },
        [selectedParty]
    );

    const deliverEmail = async ({ kind, to, link, doc, members }) => {
        const partyMembersForApi = members
            .map((m) => ({
                email: (m.member_email || '').toLowerCase(),
                name: m.user_name,
            }))
            .filter((m) => m.email);
        const actorName = currentUser?.name || currentUser?.username || 'A friend';
        const apiResult = await sendPartyEmailViaApi({
            kind,
            to,
            partyMembers: partyMembersForApi,
            partyName: selectedParty.name,
            shareLink: link,
            actorName,
            version: doc.version,
            ownerEmail: ownerEmail || undefined,
        });
        if (apiResult.ok) {
            Alert.alert('Email sent', `Message sent to ${to.join(', ')}.`);
            return;
        }
        if (kind === 'broadcast') {
            await shareLink({
                title: selectedParty.name,
                message: `Updated party "${selectedParty.name}" (v${doc.version}):`,
                url: link,
            });
            return;
        }
        let mail;
        if (kind === 'member_update') {
            mail = buildMemberUpdateMail({ partyName: selectedParty.name, actorName, shareLink: link });
        } else {
            mail = buildBroadcastMail({ partyName: selectedParty.name, actorName, shareLink: link, version: doc.version });
        }
        await openMailtoFallback({ to, subject: mail.subject, body: mail.body });
    };

    const sendUpdateToOwner = async () => {
        if (!ownerEmail) {
            Alert.alert('Missing owner email', 'Add your email on the Account screen so members can send updates.');
            return;
        }
        setBusy(true);
        try {
            const { doc, link, members } = await buildExport({
                proposal: true,
                proposedBy: { email: viewerEmail, name: currentUser?.name || currentUser?.username },
                touchUpdatedAt: true,
            });
            await deliverEmail({ kind: 'member_update', to: [ownerEmail], link, doc, members });
        } catch (error) {
            Alert.alert('Error', error?.message || 'Failed to send update');
        } finally {
            setBusy(false);
        }
    };

    const pushToEveryone = async () => {
        setBusy(true);
        try {
            const bundle = await loadPartyBundle(selectedParty.id);
            const secret = bundle.party.sync_secret || await ensureSecret();
            const nextVersion = Number(bundle.party.sync_version || 1) + 1;
            await partyOperations.updateSyncFields(selectedParty.id, {
                sync_version: nextVersion,
                updated_at: Date.now(),
            });
            const updatedParty = await partyOperations.getById(selectedParty.id);
            const doc = buildPartyExportDocument(updatedParty, bundle.members, bundle.meals);
            doc.version = nextVersion;
            doc.updatedAt = Date.now();
            const link = await buildShareLinkForPayload(doc, secret, { stripHeavy: true });
            const recipients = bundle.members
                .map((m) => (m.member_email || '').toLowerCase())
                .filter((e) => e && e !== viewerEmail);
            if (recipients.length) {
                await deliverEmail({ kind: 'broadcast', to: recipients, link, doc, members: bundle.members });
            } else {
                await shareLink({
                    title: selectedParty.name,
                    message: `Share this party update (v${nextVersion}) with your members:`,
                    url: link,
                });
                Alert.alert('Share update', 'Copy or share the link with your party members.');
            }
            onPartyUpdated?.();
        } catch (error) {
            Alert.alert('Error', error?.message || 'Failed to broadcast');
        } finally {
            setBusy(false);
        }
    };

    const acceptPending = async () => {
        if (!pendingImport?.doc) return;
        setBusy(true);
        try {
            const { doc, secret } = pendingImport;
            const nextVersion = Number(doc.version || 1) + 1;
            await applyPartyDocument(
                { ...doc, proposal: false, version: nextVersion, updatedAt: Date.now() },
                {
                    localPartyId: selectedParty?.id,
                    syncSecret: secret,
                    incrementVersion: false,
                }
            );
            await partyOperations.updateSyncFields(selectedParty.id, {
                sync_version: nextVersion,
                updated_at: Date.now(),
            });
            onClearPendingImport?.();
            onPartyUpdated?.();
            Alert.alert(
                'Changes accepted',
                `Party is now version ${nextVersion}. Push an update so members receive the new link.`
            );
        } catch (error) {
            Alert.alert('Error', error?.message || 'Failed to apply changes');
        } finally {
            setBusy(false);
        }
    };

    React.useEffect(() => {
        if (!pendingImport) {
            setReviewLines([]);
            return;
        }
        (async () => {
            try {
                const bundle = selectedParty ? await loadPartyBundle(selectedParty.id) : null;
                const localDoc = bundle
                    ? buildPartyExportDocument(bundle.party, bundle.members, bundle.meals)
                    : null;
                setReviewLines(summarizePartyChanges(localDoc, pendingImport.doc));
            } catch {
                setReviewLines(summarizePartyChanges(null, pendingImport.doc));
            }
        })();
    }, [pendingImport, selectedParty]);

    if (!selectedParty) return null;

    return (
        <>
            <PartyMembersList
                theme={theme}
                members={partyMembers}
                isOwner={isOwner}
                partyId={selectedParty.id}
                onChanged={onPartyUpdated}
            />
            <View style={[styles.wrap, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                <Text style={[styles.note, { color: theme.colors.text.secondary }]}>
                    Membership and party updates sync via shareable links and optional email. Nothing is stored on our
                    servers.
                </Text>
                <Text style={[styles.meta, { color: theme.colors.text.tertiary }]}>
                    Sync version {syncVersion}
                    {selectedParty.updated_at ? ` · updated ${new Date(selectedParty.updated_at).toLocaleString()}` : ''}
                </Text>
                <View style={styles.row}>
                    {!isOwner && ownerEmail ? (
                        <TouchableOpacity
                            style={[styles.btn, { backgroundColor: theme.primary[500], opacity: busy ? 0.6 : 1 }]}
                            disabled={busy}
                            onPress={sendUpdateToOwner}
                        >
                            <Ionicons name="mail-outline" size={16} color="#fff" />
                            <Text style={styles.btnText}>Send update to owner</Text>
                        </TouchableOpacity>
                    ) : null}
                    {isOwner ? (
                        <TouchableOpacity
                            style={[styles.btn, { backgroundColor: theme.accent.green, opacity: busy ? 0.6 : 1 }]}
                            disabled={busy}
                            onPress={pushToEveryone}
                        >
                            <Ionicons name="send-outline" size={16} color="#fff" />
                            <Text style={styles.btnText}>Push update to everyone</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                <Modal visible={Boolean(pendingImport)} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>Review party changes</Text>
                            <ScrollView style={styles.reviewList}>
                                {reviewLines.map((line, i) => (
                                    <Text key={i} style={{ color: theme.colors.text.secondary, marginBottom: 8 }}>
                                        • {line}
                                    </Text>
                                ))}
                            </ScrollView>
                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={[styles.btn, { backgroundColor: theme.colors.border }]}
                                    onPress={onClearPendingImport}
                                >
                                    <Text style={[styles.btnText, { color: theme.colors.text.primary }]}>Reject</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.btn, { backgroundColor: theme.primary[500], opacity: busy ? 0.6 : 1 }]}
                                    disabled={busy}
                                    onPress={acceptPending}
                                >
                                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Accept</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    note: { fontSize: 13, marginBottom: 6, lineHeight: 18 },
    meta: { fontSize: 12, marginBottom: 10 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalCard: { borderRadius: 16, padding: 20, maxHeight: '80%' },
    modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
    reviewList: { maxHeight: 280, marginBottom: 16 },
    modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
});
