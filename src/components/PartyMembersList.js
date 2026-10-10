import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { partyOperations } from '../database/operations';
import { removeLiveMember } from '../services/partyLiveSync';

export default function PartyMembersList({
    theme,
    members,
    isOwner,
    partyId,
    onChanged,
    livePartyId,
    syncMode,
}) {
    if (!members?.length) return null;

    const handleRemove = (member) => {
        if (!member.sync_member_id || member.role === 'owner') return;
        Alert.alert('Remove member', `Remove ${member.user_name || 'this member'} from the party?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    if (syncMode === 'live' && livePartyId && member.sync_member_id) {
                        await removeLiveMember({
                            livePartyId,
                            memberId: member.sync_member_id,
                        });
                    }
                    await partyOperations.removeMemberFromParty(partyId, member.sync_member_id);
                    onChanged?.();
                },
            },
        ]);
    };

    return (
        <View style={[styles.wrap, { borderColor: theme.colors.border }]}>
            <Text style={[styles.heading, { color: theme.colors.text.primary }]}>Members</Text>
            {members.map((member) => {
                const status = member.member_status || 'confirmed';
                const joined = member.joined_at
                    ? new Date(member.joined_at).toLocaleDateString()
                    : '—';
                return (
                    <View
                        key={member.id}
                        style={[styles.row, { borderBottomColor: theme.colors.border }]}
                    >
                        <View style={styles.info}>
                            <Text style={[styles.name, { color: theme.colors.text.primary }]}>
                                {member.user_name || 'Member'}
                                {member.role === 'owner' ? ' (owner)' : ''}
                            </Text>
                            <Text style={[styles.meta, { color: theme.colors.text.tertiary }]}>
                                Joined {joined} · {status === 'pending' ? 'Pending' : 'Confirmed'}
                            </Text>
                        </View>
                        {isOwner && member.role !== 'owner' ? (
                            <TouchableOpacity onPress={() => handleRemove(member)} accessibilityLabel="Remove member">
                                <Ionicons name="person-remove-outline" size={22} color={theme.accent.red} />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
    heading: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '600' },
    meta: { fontSize: 12, marginTop: 2 },
});
