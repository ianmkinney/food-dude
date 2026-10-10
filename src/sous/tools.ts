import {
    groceryOperations,
    mealPlanOperations,
    memoryOperations,
    pantryOperations,
    recipeOperations,
} from '../database/operations';
import { isMemoryEnabled } from '../memory/memorySettings';
import { parseRecipe, parseRecipeFromUrl } from '../services/recipeParser';
import { estimateGroceryCost } from '../services/groceryService';
import { toPersistentImageUri } from '../services/mediaPrep';
import { Platform } from 'react-native';
import { ATTACHMENT_SOURCE_LABEL } from './attachmentLimits';
import type { ChatRecipeAction } from '../chat/chatRecipes';

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
    | {
          tool: 'update_recipe';
          args: {
              recipe_id: number;
              title?: string;
              description?: string;
              servings?: number;
              prep_time?: number;
              cook_time?: number;
              ingredients?: { ingredient: string; quantity?: string | number | null; unit?: string | null }[];
              instructions?: string[];
          };
      }
    | { tool: 'add_to_meal_plan'; args: { recipe_id?: number; recipe_title?: string; date: string; meal_type: MealType } }
    | { tool: 'add_to_pantry'; args: { items: ItemArg[] } }
    | { tool: 'add_to_grocery'; args: { items: ItemArg[] } }
    | { tool: 'estimate_cost'; args: { store?: string } }
    | { tool: 'remember_fact'; args: { fact: string; category: string } };

export type RecipeSummary = { id: number; title: string; image_uri?: string | null; is_ai_generated?: number | null };

export type SousCard =
    | { type: 'recipes'; title: string; recipes: RecipeSummary[] }
    | {
          type: 'recipe';
          title: string;
          recipe: RecipeSummary;
          aiGenerated: boolean;
          ingredients?: string[];
          sourceLabel?: string;
          fromUserFile?: boolean;
          savedAs?: ChatRecipeAction;
      }
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
    | { type: 'error'; message: string }
    | { type: 'notice'; message: string };

/** Tool reference shown to the model inside the system prompt. */
export const TOOL_SPEC = `
- find_recipes {"query": string}: search the user's saved recipes.
- import_recipe {"url"?: string, "text"?: string}: import a recipe from a link, pasted text, or an attached file into the recipe book.
- create_recipe {"title", "description"?, "servings"?, "prep_time"?, "cook_time"?, "ingredients": [{"ingredient", "quantity"?, "unit"?}], "instructions": [string]}: save a NEW recipe (from an attachment or your draft). Only when the user wants a new dish saved.
- update_recipe {"recipe_id": number, "title"?, "description"?, "servings"?, "prep_time"?, "cook_time"?, "ingredients"?: [{"ingredient", "quantity"?, "unit"?}], "instructions"?: [string]}: rename or edit a recipe that is already saved. Send only the fields that change; ingredients and instructions replace the whole list.
If the user attached a photo, the app uses it as the recipe image automatically; never put image URLs in tool arguments.
- add_to_meal_plan {"recipe_id"?: number, "recipe_title"?: string, "date": "YYYY-MM-DD", "meal_type": "breakfast"|"lunch"|"dinner"}: schedule a saved recipe.
- add_to_pantry {"items": [{"name", "quantity"?, "unit"?, "category"?}]}: record items the user has at home.
- add_to_grocery {"items": [{"name", "quantity"?, "unit"?}]}: add items to the shopping list.
- estimate_cost {"store"?: string}: estimate what the current grocery list will cost (run after add_to_grocery when pricing a meal).
- remember_fact {"fact": string, "category": "likes"|"dislikes"|"household"|"equipment"|"skill"|"goals"}: save a durable fact about the user (not allergies — those stay in Account).`.trim();

const MEMORY_CATEGORIES = new Set(['likes', 'dislikes', 'household', 'equipment', 'skill', 'goals']);

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

type SavedRecipe = RecipeSummary & {
    prep_time?: number | null;
    cook_time?: number | null;
    ingredients?: { ingredient: string; quantity?: string | null; unit?: string | null }[];
};

type RunOptions = {
    /** First image the user attached in this chat turn; the only image Sous may store as a cover. */
    userRecipeImageUri?: string | null;
};

// Native pickers hand back local file URIs; they never leave the device.
const NATIVE_LOCAL_URI = /^(file|content|ph|assets-library):/i;

function isLocalImageUri(uri: string) {
    if (/^blob:/i.test(uri) || /^data:image\//i.test(uri)) return true;
    return Platform.OS !== 'web' && NATIVE_LOCAL_URI.test(uri);
}

/**
 * Recipe covers come only from the user's own attachment in this chat, never
 * from the model's tool args: a prompt-injected http(s) URL saved as a cover
 * would be fetched every time the recipe renders, leaking to whoever controls
 * that server.
 */
export async function persistRecipeImage(attachmentUri: string | null | undefined) {
    if (!attachmentUri || !isLocalImageUri(attachmentUri)) return null;
    try {
        const stored = await toPersistentImageUri(attachmentUri);
        return typeof stored === 'string' && isLocalImageUri(stored) ? stored : null;
    } catch {
        return null;
    }
}

const attachmentCover = (options: RunOptions) => persistRecipeImage(options.userRecipeImageUri);

async function run(call: ToolCall, options: RunOptions = {}): Promise<SousCard> {
    switch (call.tool) {
        case 'find_recipes': {
            const recipes = ((await recipeOperations.search(call.args.query || '')) as RecipeSummary[]).slice(0, 6);
            return { type: 'recipes', title: recipes.length ? `Recipes matching "${call.args.query}"` : `No saved recipes match "${call.args.query}"`, recipes };
        }
        case 'import_recipe': {
            const source = call.args.url || call.args.text || '';
            const result = isUrl(source) ? await parseRecipeFromUrl(source.trim()) : await parseRecipe(source);
            if (!result?.success || !result.recipe) {
                const err = 'error' in result ? result.error : undefined;
                throw new Error(err || "Couldn't read a recipe from that.");
            }
            const aiExtracted = Boolean(
                ('aiExtracted' in result && result.aiExtracted) || result.recipe.aiExtracted
            );
            const userCover = await attachmentCover(options);
            const cover = userCover || result.recipe.imageUri || null;
            const id = Number(await recipeOperations.create({ ...result.recipe, imageUri: cover }));
            const fromFile = Boolean(userCover);
            await recipeOperations.setProvenance(id, {
                isAiGenerated: aiExtracted,
                imageSource: cover ? (fromFile ? 'user' : 'import') : null,
            });
            return {
                type: 'recipe',
                title: aiExtracted ? 'Imported (AI from video/caption)' : 'Imported to your recipe book',
                recipe: { id, title: result.recipe.title, is_ai_generated: aiExtracted ? 1 : 0, image_uri: cover },
                aiGenerated: aiExtracted,
                fromUserFile: fromFile,
                sourceLabel: fromFile ? ATTACHMENT_SOURCE_LABEL : undefined,
                ingredients: (result.recipe.ingredients || []).map((ing: { ingredient?: string }) => ing.ingredient || ''),
                savedAs: 'imported',
            };
        }
        case 'create_recipe': {
            const a = call.args;
            const cover = await attachmentCover(options);
            const fromFile = Boolean(cover);
            const id = Number(
                await recipeOperations.create({
                    title: a.title,
                    description: a.description || null,
                    servings: a.servings || null,
                    prepTime: a.prep_time || null,
                    cookTime: a.cook_time || null,
                    totalTime: a.prep_time && a.cook_time ? a.prep_time + a.cook_time : null,
                    sourcePlatform: 'Ampi',
                    imageUri: cover,
                    ingredients: (a.ingredients || []).map((ing) => ({
                        ingredient: ing.ingredient,
                        quantity: asText(ing.quantity),
                        unit: ing.unit || null,
                    })),
                    instructions: a.instructions || [],
                })
            );
            await recipeOperations.setProvenance(id, { isAiGenerated: true, imageSource: cover ? (fromFile ? 'user' : 'ai') : null });
            return {
                type: 'recipe',
                title: 'Saved to your recipe book',
                recipe: { id, title: a.title, is_ai_generated: 1, image_uri: cover },
                aiGenerated: true,
                fromUserFile: fromFile,
                sourceLabel: fromFile ? ATTACHMENT_SOURCE_LABEL : undefined,
                ingredients: (a.ingredients || []).map((ing) => [ing.quantity, ing.unit, ing.ingredient].filter(Boolean).join(' ')),
                savedAs: 'created',
            };
        }
        case 'update_recipe': {
            const a = call.args;
            const id = Number(a.recipe_id);
            const existing = Number.isFinite(id) && id > 0 ? ((await recipeOperations.getById(id)) as SavedRecipe | null) : null;
            if (!existing) throw new Error(`I couldn't find recipe #${a.recipe_id ?? '?'} to update.`);
            const updates: Record<string, unknown> = {};
            const title = typeof a.title === 'string' ? a.title.trim() : '';
            if (title && title !== existing.title) updates.title = title;
            if (typeof a.description === 'string') updates.description = a.description.trim() || null;
            if (a.servings != null) updates.servings = Number(a.servings) || null;
            if (a.prep_time != null) updates.prepTime = Number(a.prep_time) || null;
            if (a.cook_time != null) updates.cookTime = Number(a.cook_time) || null;
            if (a.prep_time != null || a.cook_time != null) {
                const prep = Number(a.prep_time ?? existing.prep_time) || 0;
                const cook = Number(a.cook_time ?? existing.cook_time) || 0;
                updates.totalTime = prep && cook ? prep + cook : null;
            }
            if (Array.isArray(a.ingredients) && a.ingredients.length) {
                updates.ingredients = a.ingredients.map((ing) => ({
                    ingredient: ing.ingredient,
                    quantity: asText(ing.quantity),
                    unit: ing.unit || null,
                }));
            }
            if (Array.isArray(a.instructions) && a.instructions.length) updates.instructions = a.instructions;
            const keys = Object.keys(updates);
            if (!keys.length) throw new Error(`“${existing.title}” already looks like that, so nothing changed.`);
            await recipeOperations.update(existing.id, updates);
            if (updates.ingredients || updates.instructions) {
                await recipeOperations.setProvenance(existing.id, { isAiGenerated: true });
            }
            const saved = ((await recipeOperations.getById(existing.id)) as SavedRecipe | null) ?? existing;
            const renameOnly = keys.length === 1 && keys[0] === 'title';
            return {
                type: 'recipe',
                title: renameOnly ? `Renamed from “${existing.title}”` : 'Updated in your recipe book',
                recipe: {
                    id: saved.id,
                    title: saved.title,
                    is_ai_generated: saved.is_ai_generated ?? null,
                    image_uri: saved.image_uri ?? null,
                },
                aiGenerated: Boolean(saved.is_ai_generated),
                ingredients: (saved.ingredients || []).map((ing) =>
                    [ing.quantity, ing.unit, ing.ingredient].filter(Boolean).join(' ')
                ),
                savedAs: 'updated',
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
            const pantry = (await pantryOperations.getAll()) as { name: string }[];
            const have = new Set(pantry.map((p) => p.name.trim().toLowerCase()));
            const toAdd = items.filter((item) => !have.has(item.name.trim().toLowerCase()));
            const skipped = items.length - toAdd.length;
            for (const item of toAdd) {
                await groceryOperations.add({ name: item.name, quantity: asText(item.quantity), unit: item.unit || null, category: item.category || null });
            }
            const labels = toAdd.map((item) => item.name);
            if (skipped) labels.push(`(${skipped} already in pantry)`);
            return { type: 'grocery', items: labels };
        }
        case 'remember_fact': {
            if (!(await isMemoryEnabled())) {
                return { type: 'notice', message: 'Memory is turned off in Account. I did not save that.' };
            }
            const fact = String(call.args.fact || '').trim();
            const category = String(call.args.category || 'likes').toLowerCase();
            if (!fact) throw new Error('Nothing to remember.');
            if (!MEMORY_CATEGORIES.has(category)) throw new Error('Invalid memory category.');
            await memoryOperations.upsert({ fact, category, sourceChat: 'ampi' as string | null });
            return { type: 'notice', message: `I'll remember: ${fact}` };
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

export async function runTools(calls: ToolCall[], options: RunOptions = {}): Promise<SousCard[]> {
    const cards: SousCard[] = [];
    for (const call of calls.slice(0, 5)) {
        try {
            cards.push(await run(call, options));
        } catch (error) {
            cards.push({ type: 'error', message: (error as Error)?.message || 'That step failed.' });
        }
    }
    return cards;
}
