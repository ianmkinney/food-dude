import { partyMealOperations, partyMemberOperations, partyOperations } from '../database/operations';
import { getOwnerSession } from '../platform/ownerSession';
import {
    applyLivePartySnapshot,
    fetchLivePartySnapshot,
    migrateLocalPartyToLive,
    setStoredLiveVersion,
    ensurePartyMemberToken,
    setStoredMemberToken,
} from './partyLiveSync';
import { isHumanPartyMemberRow } from '../utils/partyMemberList';

function membersForMigrate(localMembers, ownerEmail) {
    const owner = ownerEmail ? String(ownerEmail).toLowerCase() : '';
    const seen = new Set();
    const out = [];
    for (const m of localMembers || []) {
        if (!isHumanPartyMemberRow(m)) continue;
        const email = m.member_email ? String(m.member_email).toLowerCase() : '';
        if (owner && email === owner) continue;
        const key = email || `name:${String(m.user_name || '').toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            displayName: m.user_name,
            email: m.member_email || null,
        });
    }
    return out;
}

/**
 * Attach a local-only party to Neon (or refresh an already-linked live party).
 * @param {object} party — row from partyOperations.getById
 * @returns {Promise<object|null>} refreshed party row
 */
export async function ensurePartyLiveReady(party) {
    if (!party?.id) return null;
    const session = await getOwnerSession();
    if (!session?.token) return party;

    if (party.live_party_id) {
        if (party.sync_mode !== 'live') {
            await partyOperations.setLiveSyncFields(party.id, { syncMode: 'live' });
        }
        try {
            const snapshot = await fetchLivePartySnapshot(party.live_party_id);
            await setStoredLiveVersion(party.live_party_id, snapshot.version);
            await ensurePartyMemberToken(party.live_party_id);
            await applyLivePartySnapshot(party.id, snapshot);
        } catch (error) {
            console.warn('[party ensure live]', error?.message || error);
        }
        return partyOperations.getById(party.id);
    }

    try {
        const members = await partyMemberOperations.getByPartyId(party.id);
        const meals = await partyMealOperations.getByPartyId(party.id);
        const ownerEmail = party.owner_email || session.email;
        const result = await migrateLocalPartyToLive({
            name: party.name,
            meals: meals.map((m) => ({
                name: m.name,
                description: m.description,
                recipeIds: m.recipeIds || [],
                recipeMeta: m.recipeMeta || (m.recipe_meta ? JSON.parse(m.recipe_meta) : {}),
                id: m.sync_meal_id,
            })),
            members: membersForMigrate(members, ownerEmail),
            imageBase64: null,
        });
        await setStoredMemberToken(result.partyId, result.ownerMemberToken);
        await partyOperations.setLiveSyncFields(party.id, {
            livePartyId: result.partyId,
            syncMode: 'live',
            liveInviteToken: result.inviteToken,
            liveVersion: result.party.version,
        });
        if (session.email) {
            await partyOperations.updateSyncFields(party.id, {
                owner_email: session.email.toLowerCase(),
            });
        }
        await applyLivePartySnapshot(party.id, result.party);
        return partyOperations.getById(party.id);
    } catch (error) {
        console.warn('[party migrate]', party.id, error?.message || error);
        return party;
    }
}
