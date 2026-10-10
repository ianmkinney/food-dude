import { partyMealOperations, partyMemberOperations, partyOperations } from '../database/operations';
import { migrateLocalPartyToLive, applyLivePartySnapshot } from './partyLiveSync';
import { getOwnerSession } from '../platform/ownerSession';

export async function autoMigrateLocalPartiesAfterSignIn() {
    const session = await getOwnerSession();
    if (!session?.token) return;
    const parties = await partyOperations.getAll();
    for (const party of parties) {
        if (party.live_party_id && party.sync_mode === 'live') continue;
        try {
            const members = await partyMemberOperations.getByPartyId(party.id);
            const meals = await partyMealOperations.getByPartyId(party.id);
            const result = await migrateLocalPartyToLive({
                name: party.name,
                meals: meals.map((m) => ({
                    name: m.name,
                    description: m.description,
                    recipeIds: m.recipeIds || [],
                    id: m.sync_meal_id,
                })),
                members: members.map((m) => ({
                    displayName: m.user_name,
                    email: m.member_email,
                })),
            });
            await partyOperations.setLiveSyncFields(party.id, {
                livePartyId: result.partyId,
                syncMode: 'live',
                liveInviteToken: result.inviteToken,
                liveVersion: result.party.version,
            });
            await applyLivePartySnapshot(party.id, result.party);
        } catch (error) {
            console.warn('[party auto-migrate]', party.id, error?.message || error);
        }
    }
}
