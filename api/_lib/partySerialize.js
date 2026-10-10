export function normalizeMealsInput(meals) {
    if (!Array.isArray(meals)) return [];
    return meals
        .map((m) => ({
            id: m.id ? String(m.id) : undefined,
            name: String(m.name || '').slice(0, 200),
            description: m.description ? String(m.description).slice(0, 2000) : null,
            recipeIds: Array.isArray(m.recipeIds) ? m.recipeIds.map((r) => Number(r) || String(r)) : [],
        }))
        .filter((m) => m.name);
}

/**
 * @param {{ party: object, members?: object[], meals?: object[], inviteToken?: string | null }} bundle
 * @param {{ isOwner?: boolean }} [options]
 */
export function rowToPartySnapshot(bundle, options = {}) {
    const { party, members, meals, inviteToken } = bundle;
    const isOwner = Boolean(options.isOwner);
    return {
        id: party.id,
        name: party.name,
        imageUrl: party.image_url || null,
        ownerEmail: isOwner ? party.owner_email : null,
        version: party.version,
        updatedAt: new Date(party.updated_at).getTime(),
        inviteToken: isOwner ? inviteToken || null : null,
        members: (members || []).map((m) => ({
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
            updatedAt: new Date(m.updated_at).getTime(),
        })),
    };
}
