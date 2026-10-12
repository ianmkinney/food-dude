import { openRouterChatJson } from './openRouterChatJson.js';
import { fetchOpenRouterModelCatalog } from './openRouterModels.js';

export const ENHANCE_DEFAULT_MODEL = 'google/gemini-2.5-flash';

function stripJsonFences(text) {
    let cleaned = String(text || '').trim();
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\n?/i, '').replace(/```\n?$/i, '');
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\n?/i, '').replace(/```\n?$/i, '');
    }
    return cleaned.trim();
}

function recipeSummary(recipe) {
    const ingredients = (recipe.ingredients || [])
        .map((ing) => `- ${ing.quantity || ''} ${ing.unit || ''} ${ing.ingredient}`.trim())
        .join('\n');
    const instructions = (recipe.instructions || [])
        .map((step, i) => `${i + 1}. ${step}`)
        .join('\n');
    return `Title: ${recipe.title}
Description: ${recipe.description || ''}
Servings: ${recipe.servings ?? ''}
Prep: ${recipe.prep_time ?? ''} min, Cook: ${recipe.cook_time ?? ''} min, Total: ${recipe.total_time ?? ''} min
Difficulty: ${recipe.difficulty || ''}
Cuisine: ${recipe.cuisine || ''}

Ingredients:
${ingredients || '(none)'}

Instructions:
${instructions || '(none)'}`;
}

/**
 * @param {{ apiKey: string, model: string, recipe: object, customInstructions?: string | null, partial?: object, testDelayMs?: number }} opts
 */
export async function runEnhanceBodyPhase(opts) {
    if (opts.testDelayMs > 0) {
        await new Promise((r) => setTimeout(r, opts.testDelayMs));
    }
    const custom = opts.customInstructions?.trim()
        ? `\nUser modifications to apply: ${opts.customInstructions.trim()}`
        : '';
    const prompt = `You are a professional chef. Improve this recipe's structure (ingredients, instructions, times, servings, difficulty, cuisine, description).${custom}

${recipeSummary(opts.recipe)}

Return ONLY JSON:
{
  "updatedRecipe": {
    "servings": number,
    "prep_time": number,
    "cook_time": number,
    "total_time": number,
    "difficulty": "easy"|"medium"|"hard",
    "cuisine": string,
    "description": string,
    "ingredients": [{"ingredient": string, "quantity": string, "unit": string|null, "section": string|null}],
    "instructions": [string]
  },
  "changes": [{"field": string, "oldValue": string|null, "newValue": string, "reason": string}]
}`;

    const catalog = await fetchOpenRouterModelCatalog(opts.apiKey);
    const modelRow = catalog.byId.get(opts.model);
    const { text } = await openRouterChatJson({
        apiKey: opts.apiKey,
        model: opts.model,
        modelRow,
        maxTokens: 2800,
        messages: [{ role: 'user', content: prompt }],
        signal: AbortSignal.timeout(55_000),
    });
    return JSON.parse(stripJsonFences(text));
}

/**
 * @param {{ apiKey: string, model: string, recipe: object, bodyRecipe: object, customInstructions?: string | null, testDelayMs?: number }} opts
 */
export async function runEnhanceNutritionPhase(opts) {
    if (opts.testDelayMs > 0) {
        await new Promise((r) => setTimeout(r, opts.testDelayMs));
    }
    const merged = { ...opts.recipe, ...opts.bodyRecipe };
    const prompt = `Estimate nutritional information PER SERVING for this recipe. Use realistic values from ingredients and cooking method.

${recipeSummary(merged)}
Servings for nutrition: ${merged.servings || 1}

Return ONLY JSON:
{
  "nutrition": {
    "servings": number,
    "calories": number|null,
    "protein": number|null,
    "carbohydrates": number|null,
    "fat": number|null,
    "fiber": number|null,
    "sugar": number|null,
    "sodium": number|null
  },
  "changes": [{"field": string, "oldValue": string|null, "newValue": string, "reason": string}]
}`;

    const catalog = await fetchOpenRouterModelCatalog(opts.apiKey);
    const modelRow = catalog.byId.get(opts.model);
    const { text } = await openRouterChatJson({
        apiKey: opts.apiKey,
        model: opts.model,
        modelRow,
        maxTokens: 900,
        messages: [{ role: 'user', content: prompt }],
        signal: AbortSignal.timeout(55_000),
    });
    return JSON.parse(stripJsonFences(text));
}
