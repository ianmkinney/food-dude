import { recipeOperations } from '../database/operations';
import { fetchEnhanceNutritionPhase } from '../services/recipeEnhanceClient';
import { hasAnyNutrition, nutritionFromAiPayload, pickNutritionFields } from './recipeNutrition';

function recipeRowPayload(recipe) {
    return {
        title: recipe.title,
        description: recipe.description,
        servings: recipe.servings,
        prep_time: recipe.prep_time,
        cook_time: recipe.cook_time,
        total_time: recipe.total_time,
        difficulty: recipe.difficulty,
        cuisine: recipe.cuisine,
        calories: recipe.calories,
        protein: recipe.protein,
        carbohydrates: recipe.carbohydrates,
        fat: recipe.fat,
        fiber: recipe.fiber,
        sugar: recipe.sugar,
        sodium: recipe.sodium,
        ingredients: recipe.ingredients || [],
        instructions: recipe.instructions || [],
    };
}

/**
 * Persist AI nutrition estimates on a recipe (idempotent).
 * @param {number} recipeId
 * @param {object} nutritionPayload
 */
export async function applyNutritionToRecipe(recipeId, nutritionPayload) {
    const fields = nutritionFromAiPayload(nutritionPayload);
    if (!Object.keys(fields).length) return false;
    const current = await recipeOperations.getById(recipeId);
    if (!current) return false;
    await recipeOperations.update(recipeId, {
        title: current.title,
        description: current.description ?? null,
        imageUri: current.image_uri ?? null,
        servings: fields.servings ?? current.servings ?? null,
        prepTime: current.prep_time ?? null,
        cookTime: current.cook_time ?? null,
        totalTime: current.total_time ?? null,
        difficulty: current.difficulty ?? null,
        cuisine: current.cuisine ?? null,
        notes: current.notes ?? null,
        ingredients: current.ingredients || [],
        instructions: current.instructions || [],
        tags: current.tags || [],
        calories: fields.calories ?? current.calories ?? null,
        protein: fields.protein ?? current.protein ?? null,
        carbohydrates: fields.carbohydrates ?? current.carbohydrates ?? null,
        fat: fields.fat ?? current.fat ?? null,
        fiber: fields.fiber ?? current.fiber ?? null,
        sugar: fields.sugar ?? current.sugar ?? null,
        sodium: fields.sodium ?? current.sodium ?? null,
        nutritionAiEstimate: 1,
    });
    return true;
}

/**
 * Background nutrition backfill for Ampi-created recipes missing facts.
 * @param {number} recipeId
 */
export async function ensureRecipeNutritionAsync(recipeId) {
    try {
        const recipe = await recipeOperations.getById(recipeId);
        if (!recipe || hasAnyNutrition(recipe)) return;
        const bodyRecipe = recipeRowPayload(recipe);
        const phase = await fetchEnhanceNutritionPhase(recipe, bodyRecipe, null);
        await applyNutritionToRecipe(recipeId, phase);
    } catch (error) {
        console.warn('[ensureRecipeNutrition]', recipeId, error?.message || error);
    }
}

export function nutritionFieldsFromCreateArgs(args) {
    const picked = pickNutritionFields({
        servings: args.servings,
        calories: args.calories,
        protein: args.protein,
        carbohydrates: args.carbohydrates ?? args.carbs,
        fat: args.fat,
        fiber: args.fiber,
        sugar: args.sugar,
        sodium: args.sodium,
    });
    return picked;
}
