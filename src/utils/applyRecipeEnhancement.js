import { recipeOperations } from '../database/operations';
import { nutritionFromAiPayload } from './recipeNutrition';

const fieldMapping = {
    prep_time: 'prepTime',
    cook_time: 'cookTime',
    total_time: 'totalTime',
    servings: 'servings',
    difficulty: 'difficulty',
    cuisine: 'cuisine',
    description: 'description',
    calories: 'calories',
    protein: 'protein',
    carbohydrates: 'carbohydrates',
    fat: 'fat',
    fiber: 'fiber',
    sugar: 'sugar',
    sodium: 'sodium',
};

function convertValue(field, value) {
    if (value === null || value === undefined || value === '') return null;
    if (
        [
            'prepTime',
            'cookTime',
            'totalTime',
            'servings',
            'calories',
            'protein',
            'carbohydrates',
            'fat',
            'fiber',
            'sugar',
            'sodium',
        ].includes(field)
    ) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            const num = parseFloat(trimmed);
            return Number.isNaN(num) ? null : num;
        }
        return typeof value === 'number' && !Number.isNaN(value) ? value : null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    }
    return value;
}

/**
 * Apply phased enhance results to a recipe row.
 * @param {number} recipeId
 * @param {{ updatedRecipe?: object, nutrition?: object, changes?: object[] }} bodyPhase
 * @param {{ nutrition?: object, changes?: object[] }} nutritionPhase
 */
export async function applyRecipeEnhancement(recipeId, bodyPhase, nutritionPhase) {
    const current = await recipeOperations.getById(recipeId);
    if (!current) throw new Error('Recipe not found');

    const updates = {
        title: current.title,
        description: current.description ?? null,
        imageUri: current.image_uri ?? null,
        servings: current.servings ?? null,
        prepTime: current.prep_time ?? null,
        cookTime: current.cook_time ?? null,
        totalTime: current.total_time ?? null,
        difficulty: current.difficulty ?? null,
        cuisine: current.cuisine ?? null,
        notes: current.notes ?? null,
        ingredients: Array.isArray(current.ingredients) ? current.ingredients : [],
        instructions: Array.isArray(current.instructions) ? current.instructions : [],
        tags: Array.isArray(current.tags) ? current.tags : [],
        calories: current.calories ?? null,
        protein: current.protein ?? null,
        carbohydrates: current.carbohydrates ?? null,
        fat: current.fat ?? null,
        fiber: current.fiber ?? null,
        sugar: current.sugar ?? null,
        sodium: current.sodium ?? null,
        nutritionAiEstimate: current.nutrition_ai_estimate ? 1 : 0,
    };

    const updatedRecipe = bodyPhase?.updatedRecipe;
    if (updatedRecipe) {
        for (const [snake, camel] of Object.entries(fieldMapping)) {
            if (updatedRecipe[snake] !== undefined) {
                updates[camel] = convertValue(camel, updatedRecipe[snake]);
            }
        }
        if (Array.isArray(updatedRecipe.ingredients)) {
            updates.ingredients = updatedRecipe.ingredients.map((ing) => ({
                ingredient: ing.ingredient || '',
                quantity: ing.quantity || null,
                unit: ing.unit || null,
                section: ing.section || null,
            }));
        }
        if (Array.isArray(updatedRecipe.instructions)) {
            updates.instructions = updatedRecipe.instructions.filter(Boolean);
        }
    }

    const nutrition = nutritionFromAiPayload(nutritionPhase?.nutrition || nutritionPhase);
    Object.assign(updates, {
        servings: nutrition.servings ?? updates.servings,
        calories: nutrition.calories ?? updates.calories,
        protein: nutrition.protein ?? updates.protein,
        carbohydrates: nutrition.carbohydrates ?? updates.carbohydrates,
        fat: nutrition.fat ?? updates.fat,
        fiber: nutrition.fiber ?? updates.fiber,
        sugar: nutrition.sugar ?? updates.sugar,
        sodium: nutrition.sodium ?? updates.sodium,
        nutritionAiEstimate: 1,
    });

    await recipeOperations.update(recipeId, updates);
    const changes = [...(bodyPhase?.changes || []), ...(nutritionPhase?.changes || [])];
    return { changes, updates };
}
