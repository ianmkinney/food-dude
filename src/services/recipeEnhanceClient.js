import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';
import { requireAiConfigured } from './aiSettings';
import { getOwnerChatModelPreference } from '../platform/ownerModelPreferences';
import aiChefService from './aiChefService';

const ENHANCE_DEFAULT_MODEL = 'google/gemini-2.5-flash';

async function postPlatformEnhance(body) {
    const token = await getOwnerSessionToken();
    if (!token) throw new Error('Sign in with Google to use platform AI.');
    const response = await fetch(`${getApiBaseUrl()}/ai/enhance-recipe`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.message || payload.error || 'Enhance request failed');
    }
    return payload;
}

function recipePayload(recipe) {
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

async function ownerModelBody(extra) {
    const ownerModel = await getOwnerChatModelPreference();
    return {
        ...extra,
        useOwnerChatModel: Boolean(ownerModel),
        model: ownerModel || ENHANCE_DEFAULT_MODEL,
    };
}

export async function fetchEnhanceBodyPhase(recipe, customInstructions) {
    const creds = await requireAiConfigured();
    if (creds.route === 'platform') {
        return postPlatformEnhance(
            await ownerModelBody({
                phase: 'body',
                recipe: recipePayload(recipe),
                customInstructions,
            })
        );
    }
    return aiChefService.enhanceRecipeBodyPhase(recipe, customInstructions);
}

export async function fetchEnhanceNutritionPhase(recipe, bodyRecipe, customInstructions) {
    const creds = await requireAiConfigured();
    if (creds.route === 'platform') {
        return postPlatformEnhance(
            await ownerModelBody({
                phase: 'nutrition',
                recipe: recipePayload(recipe),
                bodyRecipe,
                customInstructions,
            })
        );
    }
    return aiChefService.enhanceRecipeNutritionPhase(recipe, bodyRecipe, customInstructions);
}
