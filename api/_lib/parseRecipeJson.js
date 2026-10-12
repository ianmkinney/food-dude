import { extractFirstJsonObject, stripCodeFences } from './ampiResponseParse.js';
import { inferRecipeTitle, isPlaceholderRecipeTitle, resolveRecipeTitleForSave } from './recipeTitle.js';
import { coerceRecipeTemplateFromToolArgs } from './recipeNormalize.js';

function lenientJsonParse(slice) {
    try {
        return JSON.parse(slice);
    } catch {
        try {
            return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
        } catch {
            return null;
        }
    }
}

/**
 * Parse model text into a recipe object (throws with a friendly message on failure).
 * @param {string} raw
 */
export function parseRecipeJsonFromModelText(raw) {
    const cleaned = stripCodeFences(String(raw || '')).trim();
    const slice = extractFirstJsonObject(cleaned) || (cleaned.startsWith('{') ? cleaned : null);
    if (!slice) {
        throw new Error(
            "Couldn't read a recipe from the AI response. Try again or paste the recipe text directly.",
        );
    }
    const parsed = lenientJsonParse(slice);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error("Couldn't read a recipe from the AI response. Try again or paste the recipe text.");
    }
    const template = coerceRecipeTemplateFromToolArgs(parsed);
    const title = resolveRecipeTitleForSave({ ...parsed, ...template });
    if (!title) {
        throw new Error(
            "Couldn't find a recipe title in the AI response. Name the dish or paste a clearer caption.",
        );
    }
    return {
        ...parsed,
        title,
        ingredients: template.ingredients.map((ing) => ({
            ingredient: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            section: ing.note,
        })),
        instructions: template.steps,
        prepTime: template.prep_minutes,
        cookTime: template.cook_minutes,
        servings: template.servings,
        description: template.description,
    };
}

export function normalizeImportedRecipeTitle(recipe) {
    const title = resolveRecipeTitleForSave(recipe);
    if (!title) return { ...recipe, title: null };
    return { ...recipe, title };
}

export { isPlaceholderRecipeTitle, inferRecipeTitle };
