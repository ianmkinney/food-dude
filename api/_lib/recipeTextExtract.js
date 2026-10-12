import { getOpenRouterConfig } from './env.js';
import { fetchOpenRouterModelCatalog } from './openRouterModels.js';
import { openRouterChatJson } from './openRouterChatJson.js';
import { parseRecipeJsonFromModelText } from './parseRecipeJson.js';
import { mapAiRecipeToImportResponse } from './importVideoShared.js';

const CAPTION_PROMPT = `Extract a complete recipe from this social post caption or description.
Return ONLY JSON (no markdown):
{
  "title": "string",
  "description": "string or null",
  "servings": number or null,
  "prepTime": minutes or null,
  "cookTime": minutes or null,
  "totalTime": minutes or null,
  "ingredients": ["full ingredient line 1"],
  "steps": ["step 1"]
}
If there is no real recipe, return {"title": null, "ingredients": [], "steps": []}.`;

/**
 * Server-side caption → structured recipe using OpenRouter adapter (json_schema / prompt JSON).
 * @param {{ apiKey: string, text: string, meta?: object }} opts
 */
export async function extractRecipeFromSocialCaption(opts) {
    const text = String(opts.text || '').trim();
    if (!text || text.length < 20) return null;

    const { defaultModel, fallbackModels } = getOpenRouterConfig();
    const catalog = await fetchOpenRouterModelCatalog(opts.apiKey);
    const models = [defaultModel, ...fallbackModels.filter((m) => m !== defaultModel)];

    let lastError;
    for (const model of models) {
        const modelRow = catalog.byId.get(model);
        try {
            const { text: raw } = await openRouterChatJson({
                apiKey: opts.apiKey,
                model,
                modelRow,
                maxTokens: 2800,
                responseFormat: { type: 'json_object' },
                messages: [{ role: 'user', content: `${CAPTION_PROMPT}\n\nCaption:\n${text.slice(0, 12000)}` }],
                signal: AbortSignal.timeout(55_000),
            });
            const recipe = parseRecipeJsonFromModelText(raw);
            if (!recipe?.title || !Array.isArray(recipe.ingredients) || !recipe.ingredients.length) {
                throw new Error('no_recipe_in_caption');
            }
            const lines = recipe.ingredients.map((ing) =>
                typeof ing === 'string' ? ing : [ing.quantity, ing.unit, ing.ingredient || ing.name].filter(Boolean).join(' '),
            );
            return mapAiRecipeToImportResponse(
                {
                    ...recipe,
                    ingredients: lines,
                    instructions: recipe.instructions || recipe.steps,
                },
                {
                    ...(opts.meta || {}),
                    extractionMethod: 'caption_ai',
                    audioUsed: false,
                },
            );
        } catch (error) {
            lastError = error;
            console.warn(`[recipeTextExtract] ${model} failed:`, error?.message || error);
        }
    }
    if (lastError) throw lastError;
    return null;
}
