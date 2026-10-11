import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    partyMealOperations,
    partyOperations,
    recipeOperations,
    userOperations,
} from '../database/operations';

const LIVE_PARTY_ID = 'e2e-live-party';
const MEMBER_TOKEN = 'e2e-member-token';

/**
 * Deterministic party + recipe for Playwright cross-tab sync (web only).
 * Gated by `globalThis.__CROSS_TAB_SYNC_TEST__`.
 */
export async function runCrossTabSyncTestSeed() {
    await AsyncStorage.setItem(`amplifood.party.live.member.${LIVE_PARTY_ID}`, MEMBER_TOKEN);
    await AsyncStorage.setItem(`amplifood.party.live.version.${LIVE_PARTY_ID}`, '1');
    await AsyncStorage.setItem('amplifood.sync.enabled.v1', '1');

    let user = await userOperations.getCurrent();
    if (!user) {
        await userOperations.upsert({
            userId: 'e2e-user',
            name: 'E2E Cook',
            email: 'owner@example.com',
        });
        user = await userOperations.getByUserId('e2e-user');
    }

    const parties = await partyOperations.getAll();
    let party = parties.find((p) => p.live_party_id === LIVE_PARTY_ID);
    if (!party) {
        const id = await partyOperations.create({
            name: 'E2E Party',
            description: 'Cross-tab test',
            createdBy: user.user_id,
            ownerEmail: 'owner@example.com',
            partyUuid: 'e2e-party-uuid',
        });
        await partyOperations.setLiveSyncFields(id, {
            livePartyId: LIVE_PARTY_ID,
            syncMode: 'live',
            liveVersion: 1,
        });
        party = await partyOperations.getById(id);
    }

    let recipe = (await recipeOperations.getAll()).find((r) => r.title === 'E2E Cross Tab Recipe');
    if (!recipe) {
        const recipeId = await recipeOperations.create({
            title: 'E2E Cross Tab Recipe',
            description: 'Seeded for sync test',
            servings: 2,
            ingredients: [{ ingredient: 'salt', quantity: '1', unit: 'pinch' }],
            instructions: ['Taste.'],
        });
        recipe = await recipeOperations.getById(recipeId);
    }

    const meals = await partyMealOperations.getByPartyId(party.id);
    if (!meals.length) {
        await partyMealOperations.create({
            partyId: party.id,
            name: 'E2E Meal',
            description: 'Watch recipes update live',
            recipeIds: [recipe.id],
        });
    }

    if (typeof globalThis !== 'undefined') {
        globalThis.__amplifoodE2eRunSync = async () => {
            try {
                const { runFullSync } = await import('../sync/engine');
                await runFullSync();
                return { ok: true };
            } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
        };
        globalThis.__amplifoodE2eRecipeTitles = async () => {
            const { recipeOperations } = await import('../database/operations');
            return (await recipeOperations.getAll()).map((r) => r.title);
        };
        globalThis.__amplifoodE2eCreateRecipe = async (title) => {
            const { recipeOperations } = await import('../database/operations');
            const id = await recipeOperations.create({
                title,
                description: 'E2E',
                servings: 2,
                ingredients: [{ ingredient: 'salt', quantity: '1', unit: 'pinch' }],
                instructions: ['Mix.'],
            });
            const { runFullSync } = await import('../sync/engine');
            await runFullSync();
            return id;
        };
    }

    return { partyId: party.id, livePartyId: LIVE_PARTY_ID, recipeId: recipe.id };
}

export const CROSS_TAB_LIVE_PARTY_ID = LIVE_PARTY_ID;
