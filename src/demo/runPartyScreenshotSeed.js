import {
    partyMealIngredientClaimOperations,
    partyMealOperations,
    partyMemberOperations,
    partyOperations,
    recipeOperations,
    userOperations,
} from '../database/operations';

/**
 * Deterministic local data for Party UI screenshots (web only, gated by __PARTY_SCREENSHOT_SEED__).
 */
export async function runPartyScreenshotSeed() {
    const existing = await partyOperations.getAll();
    if (existing.length >= 2) {
        return { partyId: existing[0].id, mealId: (await partyMealOperations.getByPartyId(existing[0].id))[0]?.id };
    }

    let user = await userOperations.getCurrent();
    if (!user) {
        await userOperations.upsert({
            userId: 'screenshot-user',
            username: 'screenshot',
            name: 'Alex Cook',
            email: 'alex@example.com',
        });
        user = await userOperations.getByUserId('screenshot-user');
    }

    const r1 = await recipeOperations.create({
        title: 'Grilled Salmon',
        description: 'Citrus herb glaze',
        servings: 4,
        ingredients: [
            { ingredient: 'salmon fillets', quantity: '4', unit: '' },
            { ingredient: 'lemon', quantity: '2', unit: '' },
            { ingredient: 'olive oil', quantity: '3', unit: 'tbsp' },
            { ingredient: 'dill', quantity: '2', unit: 'tbsp' },
        ],
        instructions: ['Season and grill salmon.', 'Finish with lemon and dill.'],
    });
    const r2 = await recipeOperations.create({
        title: 'Roasted Vegetables',
        servings: 6,
        ingredients: [
            { ingredient: 'zucchini', quantity: '2', unit: '' },
            { ingredient: 'bell pepper', quantity: '2', unit: '' },
            { ingredient: 'red onion', quantity: '1', unit: '' },
        ],
        instructions: ['Roast at 425°F until tender.'],
    });
    const r3 = await recipeOperations.create({
        title: 'Berry Pavlova',
        servings: 8,
        ingredients: [
            { ingredient: 'egg whites', quantity: '4', unit: '' },
            { ingredient: 'berries', quantity: '2', unit: 'cups' },
            { ingredient: 'whipped cream', quantity: '1', unit: 'cup' },
        ],
        instructions: ['Bake meringue.', 'Top with cream and berries.'],
    });

    // Newest party is selected first (ORDER BY created_at DESC).
    const party2Id = await partyOperations.create({
        name: 'Game Night',
        createdBy: user.user_id,
        ownerEmail: user.email,
        partyUuid: '22222222-2222-4222-8222-222222222222',
    });
    const party1Id = await partyOperations.create({
        name: 'Weekend BBQ',
        description: 'Backyard feast',
        createdBy: user.user_id,
        ownerEmail: user.email,
        partyUuid: '11111111-1111-4111-8111-111111111111',
    });

    const members = [
        { name: 'Alex Cook', email: user.email, role: 'owner', syncId: 'm-alex' },
        { name: 'Jordan Lee', email: 'jordan@example.com', role: 'member', syncId: 'm-jordan' },
        { name: 'Sam Patel', email: 'sam@example.com', role: 'member', syncId: 'm-sam' },
        { name: 'Riley Chen', email: 'riley@example.com', role: 'member', syncId: 'm-riley' },
    ];
    for (const m of members) {
        await partyMemberOperations.add({
            partyId: party1Id,
            userId: m.role === 'owner' ? user.user_id : `u-${m.syncId}`,
            userName: m.name,
            memberEmail: m.email,
            syncMemberId: m.syncId,
            memberStatus: 'confirmed',
            role: m.role,
        });
    }
    await partyMemberOperations.add({
        partyId: party2Id,
        userId: user.user_id,
        userName: user.name,
        memberEmail: user.email,
        syncMemberId: 'm-alex-2',
        memberStatus: 'confirmed',
        role: 'owner',
    });

    const meta1 = {
        [String(r1)]: { addedByMemberId: 'm-alex', addedByDisplayName: 'Alex Cook' },
        [String(r2)]: { addedByMemberId: 'm-jordan', addedByDisplayName: 'Jordan Lee' },
    };
    const meta2 = {
        [String(r3)]: { addedByMemberId: 'm-sam', addedByDisplayName: 'Sam Patel' },
    };

    const meal1 = await partyMealOperations.create({
        partyId: party1Id,
        name: 'Saturday Dinner',
        description: 'Main spread',
        recipeIds: [r1, r2],
        recipeMeta: meta1,
        createdBy: user.user_id,
    });
    await partyMealOperations.create({
        partyId: party1Id,
        name: 'Sunday Brunch',
        recipeIds: [r3],
        recipeMeta: meta2,
        createdBy: user.user_id,
    });
    await partyMealOperations.create({
        partyId: party1Id,
        name: 'Dessert Table',
        recipeIds: [r3],
        recipeMeta: { [String(r3)]: { addedByMemberId: 'm-riley', addedByDisplayName: 'Riley Chen' } },
        createdBy: user.user_id,
    });

    await partyMealIngredientClaimOperations.claimIngredient({
        partyMealId: meal1,
        recipeId: r1,
        ingredientName: 'salmon fillets',
        claimedByUserId: user.user_id,
        claimedByUserName: 'Alex Cook',
    });
    await partyMealIngredientClaimOperations.claimIngredient({
        partyMealId: meal1,
        recipeId: r1,
        ingredientName: 'lemon',
        claimedByUserId: 'u-m-jordan',
        claimedByUserName: 'Jordan Lee',
    });
    await partyMealIngredientClaimOperations.claimIngredient({
        partyMealId: meal1,
        recipeId: r2,
        ingredientName: 'zucchini',
        claimedByUserId: 'u-m-sam',
        claimedByUserName: 'Sam Patel',
    });

    return { partyId: party1Id, mealId: meal1 };
}
