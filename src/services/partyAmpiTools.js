import { runTools } from '../sous/tools';
import { claimLiveIngredient, unclaimLiveIngredient } from './partyLiveSync';

/**
 * @param {{ tool: string, args?: object }} call
 * @param {{ livePartyId: string, members?: { memberId: string, displayName: string }[], myDisplayName?: string }} ctx
 */
export async function runPartyAmpiTool(call, ctx) {
    const tool = call?.tool;
    const args = call?.args || {};
    if (tool === 'claim_party_ingredient') {
        const livePartyId = ctx.livePartyId;
        const mealId = String(args.mealId || args.meal_id || '').trim();
        const recipeId = String(args.recipeId || args.recipe_id || 'party_chat').trim();
        const ingredientName = String(args.ingredientName || args.ingredient_name || '').trim();
        if (!livePartyId || !mealId || !ingredientName) {
            throw new Error('Missing meal or ingredient for party claim.');
        }
        let claimedByMemberName = args.claimedByMemberName || args.claimed_by_member_name;
        if (!claimedByMemberName && ctx.myDisplayName) {
            claimedByMemberName = ctx.myDisplayName;
        }
        const data = await claimLiveIngredient({
            livePartyId,
            mealSyncId: mealId,
            recipeId,
            ingredientName,
            ingredientKey: args.ingredientKey || ingredientName,
            claimedByMemberName,
        });
        const claim = (data.party?.ingredientClaims || []).find(
            (c) =>
                c.mealId === mealId &&
                c.recipeId === recipeId &&
                String(c.ingredientName || '').toLowerCase() === ingredientName.toLowerCase()
        );
        return {
            type: 'party_claim',
            ingredientName,
            claimedByDisplayName: claim?.claimedByDisplayName || claimedByMemberName,
        };
    }
    if (tool === 'unclaim_party_ingredient') {
        const claimId = String(args.claimId || args.claim_id || '').trim();
        if (!ctx.livePartyId || !claimId) throw new Error('Missing claim id.');
        await unclaimLiveIngredient({ livePartyId: ctx.livePartyId, claimId });
        return { type: 'party_unclaim', claimId };
    }
    return runTools([call]);
}

/**
 * @param {{ tool: string, args?: object }[]} calls
 * @param {object} ctx
 */
export async function runPartyAmpiTools(calls, ctx) {
    const cards = [];
    for (const call of calls || []) {
        cards.push(await runPartyAmpiTool(call, ctx));
    }
    return cards;
}
