import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from '../AnimatedPressable';
import PartyAvatar from './PartyAvatar';
import { removeLiveMember } from '../../services/partyLiveSync';
import { partyOperations } from '../../database/operations';

const STORAGE_KEY = 'amplifood.party.membersCollapsed';

export default function PartyMembersCollapsible({
    theme,
    members,
    isOwner,
    partyId,
    livePartyId,
    syncMode,
    onChanged,
    onInviteRotated,
}) {
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY).then((v) => {
            if (v === '0') setExpanded(true);
        });
    }, []);

    const toggle = useCallback(() => {
        setExpanded((e) => {
            const next = !e;
            AsyncStorage.setItem(STORAGE_KEY, next ? '0' : '1');
            return next;
        });
    }, []);

    const active = (members || []).filter((m) => (m.member_status || 'confirmed') !== 'pending');
    if (!active.length) return null;

    const stack = active.slice(0, 4);

    const removeMember = (member) => {
        if (!member.sync_member_id || member.role === 'owner') return;
        const removePromise =
            syncMode === 'live' && livePartyId
                ? removeLiveMember({ livePartyId, memberId: member.sync_member_id })
                : Promise.resolve(null);
        removePromise
            .then(async (result) => {
                if (result?.inviteToken) {
                    await partyOperations.setLiveSyncFields(partyId, { liveInviteToken: result.inviteToken });
                    onInviteRotated?.(result.inviteToken);
                }
                await partyOperations.removeMemberFromParty(partyId, member.sync_member_id);
                onChanged?.();
            })
            .catch(() => {});
    };

    return (
        <View style={[styles.wrap, { borderColor: theme.colors.border }]}>
            <AnimatedPressable onPress={toggle} style={styles.header} accessibilityRole="button">
                <View style={styles.stack}>
                    {stack.map((m, i) => (
                        <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                            <PartyAvatar name={m.user_name} seed={m.sync_member_id || m.user_id} size={28} theme={theme} />
                        </View>
                    ))}
                </View>
                <Text style={[styles.summary, { color: theme.colors.text.secondary }]}>
                    {active.length} member{active.length === 1 ? '' : 's'}
                </Text>
                <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.colors.text.tertiary}
                />
            </AnimatedPressable>
            {expanded ? (
                <View style={styles.list}>
                    {active.map((member) => (
                        <View key={member.id} style={[styles.row, { borderTopColor: theme.colors.border }]}>
                            <PartyAvatar name={member.user_name} seed={member.sync_member_id} size={32} theme={theme} />
                            <View style={styles.info}>
                                <Text style={{ color: theme.colors.text.primary, fontWeight: '600' }}>
                                    {member.user_name || 'Member'}
                                    {member.role === 'owner' ? ' · owner' : ''}
                                </Text>
                            </View>
                            {isOwner && member.role !== 'owner' ? (
                                <AnimatedPressable
                                    onPress={() => removeMember(member)}
                                    accessibilityLabel="Remove member"
                                    style={styles.remove}
                                >
                                    <Ionicons name="person-remove-outline" size={20} color={theme.accent.red} />
                                </AnimatedPressable>
                            ) : null}
                        </View>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
    header: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        gap: 10,
    },
    stack: { flexDirection: 'row', alignItems: 'center' },
    summary: { flex: 1, fontSize: 14 },
    list: {},
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    info: { flex: 1 },
    remove: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
