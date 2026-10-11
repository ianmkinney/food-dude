import { ensurePartyLiveReady } from './partyLiveEnsure';
import { getOwnerSession } from '../platform/ownerSession';
import { partyOperations } from '../database/operations';

export async function autoMigrateLocalPartiesAfterSignIn() {
    const session = await getOwnerSession();
    if (!session?.token) return;
    const parties = await partyOperations.getAll();
    for (const party of parties) {
        if (party.live_party_id && party.sync_mode === 'live') continue;
        try {
            await ensurePartyLiveReady(party);
        } catch (error) {
            console.warn('[party auto-migrate]', party.id, error?.message || error);
        }
    }
}
