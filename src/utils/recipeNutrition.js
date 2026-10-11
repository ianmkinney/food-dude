/** @typedef {import('../database/operations').RecipeRow} RecipeRow */

const NUTRITION_KEYS = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'sodium'];

export function pickNutritionFields(source) {
    if (!source || typeof source !== 'object') return {};
    const out = {};
    for (const key of NUTRITION_KEYS) {
        if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
            const n = Number(source[key]);
            out[key] = Number.isFinite(n) ? n : null;
        }
    }
    if (source.servings != null && source.servings !== '') {
        const s = Number(source.servings);
        if (Number.isFinite(s)) out.servings = s;
    }
    return out;
}

export function hasAnyNutrition(row) {
    return NUTRITION_KEYS.some((k) => row?.[k] != null);
}

export function nutritionFromAiPayload(payload) {
    const n = payload?.nutrition ? payload.nutrition : payload;
    return pickNutritionFields(n);
}
