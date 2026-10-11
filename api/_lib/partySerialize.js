export function normalizeMealsInput(meals) {
    if (!Array.isArray(meals)) return [];
    return meals
        .map((m) => ({
            id: m.id ? String(m.id) : undefined,
            name: String(m.name || '').slice(0, 200),
            description: m.description ? String(m.description).slice(0, 2000) : null,
            recipeIds: Array.isArray(m.recipeIds) ? m.recipeIds.map((r) => Number(r) || String(r)) : [],
            recipeMeta:
                m.recipeMeta && typeof m.recipeMeta === 'object' && !Array.isArray(m.recipeMeta)
                    ? m.recipeMeta
                    : {},
        }))
        .filter((m) => m.name);
}

/**
 * @param {{ party: object, members?: object[], meals?: object[], claims?: object[], inviteToken?: string | null }} bundle
 * @param {{ isOwner?: boolean }} [options]
 */
import { dedupeServerMemberRows, isHumanPartyMember } from './partyMembers.js';

export function rowToPartySnapshot(bundle, options = {}) {
    const { party, members, meals, claims, inviteToken } = bundle;
    const isOwner = Boolean(options.isOwner);
    return {
        id: party.id,
        name: party.name,
        imageUrl: party.image_url || null,
        ownerEmail: isOwner ? party.owner_email : null,
        version: party.version,
        updatedAt: new Date(party.updated_at).getTime(),
        inviteToken: isOwner ? inviteToken || null : null,
        members: dedupeServerMemberRows(members || [], { ownerEmail: party.owner_email })
            .filter((m) => isHumanPartyMember(m))
            .map((m) => ({
            memberId: m.member_id,
            displayName: m.display_name,
            email: isOwner ? m.email : null,
            status: m.status,
            joinedAt: new Date(m.joined_at).getTime(),
        })),
        meals: (meals || []).map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            recipeIds: m.recipe_ids || [],
            recipeMeta: m.recipe_meta || {},
            updatedAt: new Date(m.updated_at).getTime(),
        })),
        ingredientClaims: (claims || []).map((c) => ({
            id: c.id,
            mealId: c.meal_id,
            recipeId: c.recipe_id,
            ingredientKey: c.ingredient_key,
            ingredientName: c.ingredient_name,
            claimedByMemberId: c.claimed_by_member_id,
            claimedByDisplayName: c.claimed_by_display_name,
            claimedAt: new Date(c.claimed_at).getTime(),
        })),
    };
}
