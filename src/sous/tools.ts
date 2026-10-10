import {
    groceryOperations,
    mealPlanOperations,
    pantryOperations,
    recipeOperations,
} from '../database/operations';
import { parseRecipe, parseRecipeFromUrl } from '../services/recipeParser';
import { estimateGroceryCost } from '../services/groceryService';

// What Sous can actually do in the app. The model asks for these by name in its
// JSON reply (see agent.ts); each one runs against the local database and
// returns a card the chat renders and links to the matching screen.

export type MealType = 'breakfast' | 'lunch' | 'dinner';

type ItemArg = { name: string; quantity?: string | number | null; unit?: string | null; category?: string | null };

export type ToolCall =
    | { tool: 'find_recipes'; args: { query: string } }
    | { tool: 'import_recipe'; args: { url?: string; text?: string } }
    | {
          tool: 'create_recipe';
          args: {
              title: string;
              description?: string;
              servings?: number;
              prep_time?: number;
              cook_time?: number;
              ingredients: { ingredient: string; quantity?: string | number | null; unit?: string | null }[];
              instructions: string[];
          };
      }
    | { tool: 'add_to_meal_plan'; args: { recipe_id?: number; recipe_title?: string; date: string; meal_type: MealType } }
    | { tool: 'add_to_pantry'; args: { items: ItemArg[] } }
    | { tool: 'add_to_grocery'; args: { items: ItemArg[] } }
    | { tool: 'estimate_cost'; args: { store?: string } };

export type RecipeSummary = { id: number; title: string; image_uri?: string | null; is_ai_generated?: number | null };

export type SousCard =
    | { type: 'recipes'; title: string; recipes: RecipeSummary[] }
    | { type: 'recipe'; title: string; recipe: RecipeSummary; aiGenerated: boolean; ingredients?: string[] }
    | { type: 'meal_plan'; recipeTitle: string; date: string; mealType: MealType }
    | { type: 'pantry'; items: string[] }
    | { type: 'grocery'; items: string[] }
    | {
          type: 'cost';
          total: number | null;
          currency: string;
          store: string | null;
          lineItems?: { name: string; estimatedCost: number }[];
      }
    | { type: 'error'; message: string };

/** Tool reference shown to the model inside the system prompt. */
export const TOOL_SPEC = `
- find_recipes {"query": string}: search the user's saved recipes.
- import_recipe {"url"?: string, "text"?: string}: import a real recipe from a link or pasted text into the recipe book.
- create_recipe {"title", "description"?, "servings"?, "prep_time"?, "cook_time"?, "ingredients": [{"ingredient", "quantity"?, "unit"?}], "instructions": [string]}: save a NEW recipe you wrote.
- add_to_meal_plan {"recipe_id"?: number, "recipe_title"?: string, "date": "YYYY-MM-DD", "meal_type": "breakfast"|"lunch"|"dinner"}: schedule a saved recipe.
- add_to_pantry {"items": [{"name", "quantity"?, "unit"?, "category"?}]}: record items the user has at home.
- add_to_grocery {"items": [{"name", "quantity"?, "unit"?}]}: add items to the shopping list.
- estimate_cost {"store"?: string}: estimate what the current grocery list will cost (run after add_to_grocery when pricing a meal).`.trim();

const asText = (value: unknown) => (value == null || value === '' ? null : String(value));
const isUrl = (value?: string) => !!value && /^https?:\/\/\S+$/i.test(value.trim());

async function findRecipe(args: { recipe_id?: number; recipe_title?: string }): Promise<RecipeSummary | null> {
    if (args.recipe_id) {
        const byId = await recipeOperations.getById(Number(args.recipe_id));
        if (byId) return byId as RecipeSummary;
    }
    if (args.recipe_title) {
        const matches = (await recipeOperations.search(args.recipe_title)) as RecipeSummary[];
        return matches[0] ?? null;
    }
    return null;
}

async function run(call: ToolCall): Promise<SousCard> {
    switch (call.tool) {
        case 'find_recipes': {
            const recipes = ((await recipeOperations.search(call.args.query || '')) as RecipeSummary[]).slice(0, 6);
            return { type: 'recipes', title: recipes.length ? `Recipes matching "${call.args.query}"` : `No saved recipes match "${call.args.query}"`, recipes };
        }
        case 'import_recipe': {
            const source = call.args.url || call.args.text || '';
            const result = isUrl(source) ? await parseRecipeFromUrl(source.trim()) : await parseRecipe(source);
            if (!result?.success) throw new Error(result?.error || "Couldn't read a recipe from that.");
            const id = Number(await recipeOperations.create(result.recipe));
            await recipeOperations.setProvenance(id, { isAiGenerated: false, imageSource: result.recipe.imageUri ? 'import' : null });
            return {
                type: 'recipe',
                title: 'Imported to your recipe book',
                recipe: { id, title: result.recipe.title },
                aiGenerated: false,
                ingredients: (result.recipe.ingredients || []).map((ing: { ingredient?: string }) => ing.ingredient || ''),
            };
        }
        case 'create_recipe': {
            const a = call.args;
            const id = Number(
                await recipeOperations.create({
                    title: a.title,
                    description: a.description || null,
                    servings: a.servings || null,
                    prepTime: a.prep_time || null,
                    cookTime: a.cook_time || null,
                    totalTime: a.prep_time && a.cook_time ? a.prep_time + a.cook_time : null,
                    sourcePlatform: 'Ampi',
                    ingredients: (a.ingredients || []).map((ing) => ({
                        ingredient: ing.ingredient,
                        quantity: asText(ing.quantity),
                        unit: ing.unit || null,
                    })),
                    instructions: a.instructions || [],
                })
            );
            await recipeOperations.setProvenance(id, { isAiGenerated: true });
            return {
                type: 'recipe',
                title: 'Saved to your recipe book',
                recipe: { id, title: a.title, is_ai_generated: 1 },
                aiGenerated: true,
                ingredients: (a.ingredients || []).map((ing) => [ing.quantity, ing.unit, ing.ingredient].filter(Boolean).join(' ')),
            };
        }
        case 'add_to_meal_plan': {
            const recipe = await findRecipe(call.args);
            if (!recipe) throw new Error(`I couldn't find "${call.args.recipe_title ?? call.args.recipe_id}" in your recipes.`);
            await mealPlanOperations.add({ recipeId: recipe.id, date: call.args.date, mealType: call.args.meal_type, servings: 1 });
            return { type: 'meal_plan', recipeTitle: recipe.title, date: call.args.date, mealType: call.args.meal_type };
        }
        case 'add_to_pantry': {
            const items = call.args.items || [];
            for (const item of items) {
                await pantryOperations.add({ name: item.name, quantity: asText(item.quantity), unit: item.unit || null, category: item.category || null });
            }
            return { type: 'pantry', items: items.map((item) => item.name) };
        }
        case 'add_to_grocery': {
            const items = call.args.items || [];
            for (const item of items) {
                await groceryOperations.add({ name: item.name, quantity: asText(item.quantity), unit: item.unit || null, category: item.category || null });
            }
            return { type: 'grocery', items: items.map((item) => item.name) };
        }
        case 'estimate_cost': {
            const list = await groceryOperations.getAll();
            if (!list.length) throw new Error('Your grocery list is empty, so there is nothing to price yet.');
            const result = await estimateGroceryCost(list, call.args.store || '');
            if (!result?.success) throw new Error(result?.error || "Couldn't estimate the cost.");
            const items = Array.isArray(result.estimate?.items)
                ? result.estimate.items
                      .filter((row: { name?: string; estimatedCost?: number }) => row?.name && typeof row.estimatedCost === 'number')
                      .map((row: { name: string; estimatedCost: number }) => ({
                          name: row.name,
                          estimatedCost: row.estimatedCost,
                      }))
                : [];
            return {
                type: 'cost',
                total: typeof result.estimate?.totalCost === 'number' ? result.estimate.totalCost : null,
                currency: result.estimate?.currency || 'USD',
                store: call.args.store || null,
                lineItems: items.length ? items : undefined,
            };
        }
        default:
            throw new Error('Ampi asked for something it cannot do yet.');
    }
}

export async function runTools(calls: ToolCall[]): Promise<SousCard[]> {
    const cards: SousCard[] = [];
    for (const call of calls.slice(0, 5)) {
        try {
            cards.push(await run(call));
        } catch (error) {
            cards.push({ type: 'error', message: (error as Error)?.message || 'That step failed.' });
        }
    }
    return cards;
}
