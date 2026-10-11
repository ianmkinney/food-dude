import { chatOperations } from '../database/operations';
import { groceryOperations, pantryOperations, recipeOperations } from '../database/operations';
import { CHAT_THREAD_AMPI } from '../chat/chatThreads';
/** Deterministic data for desktop layout screenshots (web only). */
export async function runDesktopScreenshotSeed() {
    const recipes = await recipeOperations.getAll();
    if (recipes.length < 2) {
        await recipeOperations.create({
            title: 'Weeknight Tomato Pasta',
            description: 'Garlic, olive oil, and canned tomatoes in twenty minutes.',
            totalTime: 25,
            difficulty: 'easy',
            ingredients: [
                { ingredient: 'spaghetti', amount: '12', unit: 'oz' },
                { ingredient: 'canned tomatoes', amount: '1', unit: 'can' },
            ],
            instructions: ['Boil pasta.', 'Simmer tomatoes with garlic and olive oil.', 'Toss and serve.'],
        });
        await recipeOperations.create({
            title: 'Sheet-Pan Lemon Chicken',
            description: 'Crispy chicken with potatoes and green beans.',
            totalTime: 45,
            difficulty: 'medium',
            ingredients: [
                { ingredient: 'chicken thighs', amount: '4', unit: '' },
                { ingredient: 'potatoes', amount: '1', unit: 'lb' },
            ],
            instructions: ['Roast at 425°F until chicken hits 165°F internal.'],
        });
    }

    const grocery = await groceryOperations.getAll();
    if (grocery.length < 3) {
        for (const row of [
            { name: 'Eggs', category: 'Dairy' },
            { name: 'Milk', category: 'Dairy' },
            { name: 'Basil', category: 'Produce' },
        ]) {
            await groceryOperations.add(row);
        }
    }

    const pantry = await pantryOperations.getAll();
    if (pantry.length < 2) {
        for (const row of [{ name: 'Olive oil', category: 'Pantry' }, { name: 'Garlic', category: 'Produce' }]) {
            await pantryOperations.add(row);
        }
    }

    const recent = await chatOperations.getRecent(CHAT_THREAD_AMPI, 3);
    if (!recent.length) {
        await chatOperations.addMessage(CHAT_THREAD_AMPI, {
            role: 'user',
            text: 'What can I cook with eggs and milk?',
        });
        await chatOperations.addMessage(CHAT_THREAD_AMPI, {
            role: 'sous',
            text: 'You could make a simple frittata or soft scrambled eggs with a splash of milk. Want a full recipe?',
        });
    }

    await runPartyScreenshotSeedOptional();
}

async function runPartyScreenshotSeedOptional() {
    try {
        const { runPartyScreenshotSeed } = await import('./runPartyScreenshotSeed');
        await runPartyScreenshotSeed();
    } catch {
        // Party seed is optional for layout shots.
    }
}
