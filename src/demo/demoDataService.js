import {
    chatOperations,
    groceryOperations,
    mealPlanOperations,
    pantryOperations,
    partyMealOperations,
    partyMemberOperations,
    partyOperations,
    recipeOperations,
    userOperations,
    getDatabase,
} from '../database/operations';
import { CHAT_THREAD_AMPI } from '../chat/chatThreads';
import { scheduleSyncPush } from '../sync/engine';
import {
    DEMO_GROCERY,
    DEMO_PANTRY,
    DEMO_PARTY_UUID,
    DEMO_RECIPES,
    demoMealPlanEntries,
} from './demoDataCatalog';

const DEMO_TABLES = ['meal_plans', 'grocery_items', 'pantry_items', 'chat_messages', 'recipes', 'parties'];

async function markDemo(table, idColumn, ids) {
    if (!ids.length) return;
    const db = getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(`UPDATE ${table} SET demo = 1 WHERE ${idColumn} IN (${placeholders})`, ids);
}

export async function hasDemoData() {
    const db = getDatabase();
    for (const table of DEMO_TABLES) {
        const row = await db.getFirstAsync(`SELECT 1 AS x FROM ${table} WHERE demo = 1 LIMIT 1`);
        if (row) return true;
    }
    return false;
}

export async function seedDemoData() {
    if (await hasDemoData()) {
        return { seeded: false, reason: 'already_exists' };
    }

    const recipeIds = [];
    const recipeIdsByTitle = {};
    for (const spec of DEMO_RECIPES) {
        const id = Number(
            await recipeOperations.create({
                ...spec,
                sourcePlatform: 'AmpliFood demo',
                nutritionAiEstimate: 1,
            })
        );
        await recipeOperations.setProvenance(id, { isAiGenerated: true, imageSource: null });
        recipeIds.push(id);
        recipeIdsByTitle[spec.title] = id;
    }
    await markDemo('recipes', 'id', recipeIds);

    const mealIds = [];
    for (const entry of demoMealPlanEntries(recipeIdsByTitle)) {
        const id = Number(await mealPlanOperations.add(entry));
        mealIds.push(id);
    }
    await markDemo('meal_plans', 'id', mealIds);

    const groceryIds = [];
    for (const row of DEMO_GROCERY) {
        const id = Number(await groceryOperations.add(row));
        groceryIds.push(id);
    }
    await markDemo('grocery_items', 'id', groceryIds);

    const pantryIds = [];
    for (const row of DEMO_PANTRY) {
        const id = Number(
            await pantryOperations.add({
                name: row.name,
                category: row.category,
                expirationDate: row.expirationDate,
                freshnessPct: row.freshnessPct,
                amountPct: row.amountPct,
            })
        );
        pantryIds.push(id);
    }
    await markDemo('pantry_items', 'id', pantryIds);

    const chatIds = [];
    const m1 = await chatOperations.addMessage(CHAT_THREAD_AMPI, {
        role: 'user',
        text: 'What can I make with eggs and spinach this week?',
    });
    const m2 = await chatOperations.addMessage(CHAT_THREAD_AMPI, {
        role: 'sous',
        text: 'A veggie frittata or salmon rice bowls would work well. Check your demo meal plan — I saved a few ideas there.',
    });
    chatIds.push(m1, m2);
    await markDemo('chat_messages', 'id', chatIds);

    let user = await userOperations.getCurrent();
    if (!user) {
        await userOperations.upsert({
            userId: 'demo-user',
            username: 'demo',
            name: 'Demo Cook',
            email: 'demo@example.com',
        });
        user = await userOperations.getByUserId('demo-user');
    }

    const partyId = await partyOperations.create({
        name: 'Demo Dinner Club',
        description: 'Sample local party (not synced to cloud)',
        createdBy: user?.user_id,
        ownerEmail: user?.email,
        partyUuid: DEMO_PARTY_UUID,
    });
    await markDemo('parties', 'id', [partyId]);

    await partyMemberOperations.add({
        partyId,
        userId: user.user_id,
        userName: user.name || 'Demo Cook',
        memberEmail: user.email,
        syncMemberId: 'demo-owner',
        memberStatus: 'confirmed',
        role: 'owner',
    });

    const main = recipeIdsByTitle['Weeknight Tomato Pasta'];
    const side = recipeIdsByTitle['Greek Salad Bowl'];
    if (main && side) {
        await partyMealOperations.create({
            partyId,
            name: 'Friday Night',
            description: 'Demo meal with shared recipes',
            recipeIds: [main, side],
            recipeMeta: {
                [String(main)]: { addedByMemberId: 'demo-owner', addedByDisplayName: user.name || 'Demo Cook' },
                [String(side)]: { addedByMemberId: 'demo-owner', addedByDisplayName: user.name || 'Demo Cook' },
            },
            createdBy: user.user_id,
        });
    }

    scheduleSyncPush();
    return { seeded: true, recipeCount: recipeIds.length };
}

export async function removeDemoData() {
    const db = getDatabase();
    await db.runAsync('DELETE FROM meal_plans WHERE demo = 1');
    await db.runAsync('DELETE FROM grocery_items WHERE demo = 1');
    await db.runAsync('DELETE FROM pantry_items WHERE demo = 1');
    await db.runAsync('DELETE FROM chat_messages WHERE demo = 1');
    await db.runAsync('DELETE FROM recipes WHERE demo = 1');
    await db.runAsync('DELETE FROM parties WHERE demo = 1');
    scheduleSyncPush();
    return { removed: true };
}
