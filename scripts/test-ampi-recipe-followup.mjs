#!/usr/bin/env node
/**
 * Ampi follow-ups after an import: "You choose" must rename the imported recipe
 * through update_recipe, not create an unrelated new one. Runs the real
 * agent/tools/chat-context code against in-memory stubs and a scripted model.
 * Run: npm run test:ampi
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./test-support/ts-hooks.mjs', import.meta.url, {
    data: {
        stubUrl: new URL('./test-support/ampi-stubs.mjs', import.meta.url).href,
        stubbed: [
            'react-native',
            '@react-native-async-storage/async-storage',
            'src/database/operations',
            'src/services/aiClient',
            'src/sous/chatAttachments',
            'src/consent/consentStore',
            'src/services/recipeParser',
            'src/services/groceryService',
            'src/services/mediaPrep',
        ],
    },
});

const { ampiTest } = await import('./test-support/ampi-stubs.mjs');
const { askSous, confirmSousActions } = await import('../src/sous/agent.ts');
const { runTools } = await import('../src/sous/tools.ts');
const { persistAmpiExchange } = await import('../src/chat/promptContext.ts');
const { chatRecipesForPrompt } = await import('../src/chat/chatRecipes.ts');
const { CHAT_THREAD_AMPI } = await import('../src/chat/chatThreads.ts');

const reply = (text, actions = []) => () => JSON.stringify({ reply: text, actions });

const LASAGNA_SOUP = {
    success: true,
    recipe: {
        title: 'Lasagna Soup',
        sourceUrl: 'https://www.instagram.com/p/lasagna-soup/',
        ingredients: [
            { ingredient: 'Italian sausage', quantity: '1', unit: 'lb' },
            { ingredient: 'lasagna noodles', quantity: '8' },
            { ingredient: 'crushed tomatoes', quantity: '28', unit: 'oz' },
            { ingredient: 'chicken broth', quantity: '4', unit: 'cups' },
            { ingredient: 'ricotta', quantity: '1', unit: 'cup' },
            { ingredient: 'spinach', quantity: '2', unit: 'cups' },
        ],
        instructions: ['Brown the sausage.', 'Add tomatoes and broth.', 'Simmer the noodles.', 'Top with ricotta.'],
    },
};

async function sendTurn(text) {
    const history = ampiTest.chatRows.map((r) => ({ role: r.role === 'user' ? 'user' : 'sous', text: r.text }));
    const result = await askSous(history, text);
    await persistAmpiExchange(text, result.reply);
    return result;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('import, then "You choose" renames the imported recipe instead of creating a new dish', async () => {
    ampiTest.reset();

    ampiTest.model = reply('I can import that Instagram recipe — confirm below.', [
        { tool: 'import_recipe', args: { url: 'https://www.instagram.com/p/lasagna-soup/' } },
    ]);
    const first = await sendTurn('Save this https://www.instagram.com/p/lasagna-soup/');
    assert.equal(first.pendingActions?.[0]?.tool, 'import_recipe');

    ampiTest.importResult = LASAGNA_SOUP;
    const imported = await confirmSousActions(first.pendingActions, null);
    assert.equal(imported[0].type, 'recipe');
    assert.equal(imported[0].savedAs, 'imported');
    const importedId = imported[0].recipe.id;
    assert.equal(ampiTest.recipes.size, 1);

    const logRow = ampiTest.chatRows.at(-1);
    assert.equal(logRow.text, 'Imported “Lasagna Soup” into your recipe book.');
    assert.deepEqual(JSON.parse(logRow.meta_json).recipes, [{ id: importedId, title: 'Lasagna Soup', action: 'imported' }]);

    let seenPrompt = '';
    ampiTest.model = (prompt) => {
        seenPrompt = prompt;
        return JSON.stringify({
            reply: "Let's call it Sausage Lasagna Soup — confirm below.",
            actions: [{ tool: 'update_recipe', args: { recipe_id: importedId, title: 'Sausage Lasagna Soup' } }],
        });
    };
    const second = await sendTurn('You choose');

    assert.match(seenPrompt, /Recipes saved in this conversation/);
    assert.match(seenPrompt, new RegExp(`#${importedId} “Lasagna Soup” \\(imported in this chat; key ingredients: Italian sausage, lasagna noodles, crushed tomatoes`));
    assert.match(seenPrompt, /Ampi: Imported “Lasagna Soup” into your recipe book\./);
    assert.match(seenPrompt, /update_recipe \{"recipe_id": number/);
    assert.match(seenPrompt, /Never invent a different dish/);
    assert.match(seenPrompt, /Don't ask the user to name a recipe that was imported with a title/);
    assert.match(seenPrompt, /matches that recipe's actual ingredients/);
    assert.match(seenPrompt, /Only call create_recipe when the user asks for a new recipe/);

    assert.deepEqual(second.pendingActions?.map((a) => a.tool), ['update_recipe']);
    assert.equal(second.confirmSummary, '• Rename “Lasagna Soup” to “Sausage Lasagna Soup”');

    const renamed = await confirmSousActions(second.pendingActions, null);
    assert.equal(renamed[0].type, 'recipe');
    assert.equal(renamed[0].title, 'Renamed from “Lasagna Soup”');
    assert.equal(renamed[0].recipe.id, importedId);
    assert.equal(renamed[0].recipe.title, 'Sausage Lasagna Soup');
    assert.equal(ampiTest.recipes.size, 1, 'no second recipe was created');
    const stored = ampiTest.recipes.get(importedId);
    assert.equal(stored.title, 'Sausage Lasagna Soup');
    assert.equal(stored.ingredients.length, 6, 'ingredients untouched by a rename');
    assert.equal(stored.is_ai_generated, 0, 'a rename does not mark the recipe AI-generated');

    let thirdPrompt = '';
    ampiTest.model = (prompt) => {
        thirdPrompt = prompt;
        return reply('Sure.')();
    };
    await sendTurn('Thanks');
    assert.match(thirdPrompt, new RegExp(`#${importedId} “Sausage Lasagna Soup” \\(imported, then edited in this chat`));
    assert.doesNotMatch(thirdPrompt, /#\d+ “Lasagna Soup”/);
});

test('recipes imported from a video are in the next prompt', async () => {
    ampiTest.reset();
    const id = await (await import('./test-support/ampi-stubs.mjs')).recipeOperations.create(LASAGNA_SOUP.recipe);
    await persistAmpiExchange('[Screen recording attached]', 'I pulled a recipe from your video.', {
        recipes: [{ id, title: 'Lasagna Soup', action: 'imported' }],
    });
    const block = await chatRecipesForPrompt(CHAT_THREAD_AMPI);
    assert.match(block, new RegExp(`^- #${id} “Lasagna Soup” \\(imported in this chat`));
});

test('deleted recipes drop out of the conversation context', async () => {
    ampiTest.reset();
    await persistAmpiExchange('hi', 'saved', { recipes: [{ id: 99, title: 'Gone', action: 'created' }] });
    assert.equal(await chatRecipesForPrompt(CHAT_THREAD_AMPI), '');
});

test('update_recipe edits ingredients in place and rejects unknown ids and no-op edits', async () => {
    ampiTest.reset();
    const { recipeOperations } = await import('./test-support/ampi-stubs.mjs');
    const id = await recipeOperations.create(LASAGNA_SOUP.recipe);

    const [edited] = await runTools([
        {
            tool: 'update_recipe',
            args: {
                recipe_id: id,
                ingredients: [...LASAGNA_SOUP.recipe.ingredients, { ingredient: 'red pepper flakes', quantity: '1', unit: 'tsp' }],
            },
        },
    ]);
    assert.equal(edited.title, 'Updated in your recipe book');
    assert.equal(ampiTest.recipes.get(id).ingredients.length, 7);
    assert.equal(ampiTest.recipes.get(id).is_ai_generated, 1, 'AI-edited ingredients are labeled AI-generated');
    assert.equal(ampiTest.recipes.size, 1);

    const [missing] = await runTools([{ tool: 'update_recipe', args: { recipe_id: 4242, title: 'Nope' } }]);
    assert.equal(missing.type, 'error');
    assert.match(missing.message, /couldn't find recipe #4242/);

    const [noop] = await runTools([{ tool: 'update_recipe', args: { recipe_id: id, title: 'Lasagna Soup' } }]);
    assert.equal(noop.type, 'error');
    assert.equal(ampiTest.recipes.size, 1);
});

test('create_recipe confirm card says it is a new recipe', async () => {
    ampiTest.reset();
    ampiTest.model = reply('Here is a new one.', [
        { tool: 'create_recipe', args: { title: 'Creamy Chicken Pasta', ingredients: [{ ingredient: 'chicken' }], instructions: ['Cook.'] } },
    ]);
    const result = await sendTurn('Give me a new chicken pasta recipe');
    assert.equal(result.confirmSummary, '• Save a new recipe “Creamy Chicken Pasta”');
});

let failed = 0;
for (const { name, fn } of tests) {
    try {
        await fn();
        console.log('ok', name);
    } catch (error) {
        failed++;
        console.error('FAIL', name);
        console.error(error);
    }
}
if (failed) {
    console.error(`${failed} of ${tests.length} failed`);
    process.exit(1);
}
console.log(`All ${tests.length} Ampi follow-up tests passed.`);
