import { Alert } from 'react-native';
import { recipeEnhanceJobOperations, recipeOperations } from '../database/operations';
import { fetchEnhanceBodyPhase, fetchEnhanceNutritionPhase } from '../services/recipeEnhanceClient';
import { applyRecipeEnhancement } from '../utils/applyRecipeEnhancement';

let started = false;
let processing = false;
const MAX_ATTEMPTS = 3;

async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function withBackoff(fn, attempt) {
    let lastError;
    for (let i = 0; i < attempt; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            await sleep(Math.min(8000, 1000 * 2 ** i));
        }
    }
    throw lastError;
}

async function processOneJob(job) {
    const recipe = await recipeOperations.getById(job.recipe_id);
    if (!recipe) {
        await recipeEnhanceJobOperations.markFailed(job.id, 'Recipe not found');
        return;
    }
    const instructions = job.custom_instructions;

    let bodyPhase;
    try {
        bodyPhase = await withBackoff(
            () => fetchEnhanceBodyPhase(recipe, instructions),
            Math.min(MAX_ATTEMPTS, job.attempt_count || 1)
        );
        await recipeEnhanceJobOperations.patch(job.id, {
            phase: 'nutrition',
            partialJson: JSON.stringify({ body: bodyPhase }),
        });
    } catch (error) {
        await recipeEnhanceJobOperations.markFailed(job.id, error?.message || 'Enhance body failed');
        Alert.alert('Enhance failed', error?.message || 'Could not enhance recipe. Tap Retry on the recipe.');
        return;
    }

    const bodyRecipe = bodyPhase?.updatedRecipe || {};
    let nutritionPhase;
    try {
        nutritionPhase = await withBackoff(() => fetchEnhanceNutritionPhase(recipe, bodyRecipe, instructions), 2);
    } catch (error) {
        await recipeEnhanceJobOperations.patch(job.id, {
            partialJson: JSON.stringify({ body: bodyPhase, nutritionError: error?.message }),
        });
        nutritionPhase = { nutrition: {}, changes: [] };
    }

    try {
        await applyRecipeEnhancement(job.recipe_id, bodyPhase, nutritionPhase);
        await recipeEnhanceJobOperations.markDone(
            job.id,
            JSON.stringify({ body: bodyPhase, nutrition: nutritionPhase })
        );
        Alert.alert('Recipe enhanced', `${recipe.title} was updated with AI suggestions.`);
    } catch (error) {
        await recipeEnhanceJobOperations.markFailed(job.id, error?.message || 'Apply failed');
        Alert.alert('Enhance failed', error?.message || 'Could not save enhancements.');
    }
}

async function pump() {
    if (processing) return;
    processing = true;
    try {
        for (;;) {
            const job = await recipeEnhanceJobOperations.claimNextQueued();
            if (!job) break;
            await processOneJob(job);
        }
    } finally {
        processing = false;
    }
}

export function startRecipeEnhanceWorker() {
    if (started) return;
    started = true;
    const tick = () => pump().catch(() => undefined);
    tick();
    setInterval(tick, 2500);
}

export async function enqueueRecipeEnhance(recipeId, customInstructions = null) {
    const id = await recipeEnhanceJobOperations.enqueue({ recipeId, customInstructions });
    pump().catch(() => undefined);
    return id;
}

export async function retryRecipeEnhanceJob(recipeId, customInstructions = null) {
    return enqueueRecipeEnhance(recipeId, customInstructions);
}
