import { RECIPE_TEMPLATE_DEFAULTS } from './recipeNormalize.js';

const MAX_TITLE = 200;

function coerceString(value, maxLen) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s) return null;
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export const PLACEHOLDER_RECIPE_TITLES = new Set(
    ['', 'untitled recipe', 'untitled', 'imported recipe', 'imported', 'new recipe'].map((s) => s.toLowerCase()),
);

export function isPlaceholderRecipeTitle(value) {
    const s = coerceString(value, MAX_TITLE);
    if (!s) return true;
    return PLACEHOLDER_RECIPE_TITLES.has(s.toLowerCase());
}

function firstMeaningfulLine(text, maxLen = MAX_TITLE) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map((l) => l.replace(/^#+\s*/, '').replace(/^\s*[-*•]\s*/, '').trim())
        .filter(Boolean);
    for (const line of lines) {
        if (line.length < 4) continue;
        if (/^https?:\/\//i.test(line)) continue;
        if (/^(ingredients?|instructions?|directions?|method|prep|cook|serves?):?$/i.test(line)) continue;
        return line.length > maxLen ? line.slice(0, maxLen) : line;
    }
    return null;
}

/**
 * @param {Record<string, unknown>} recipe
 */
export function inferRecipeTitle(recipe) {
    const src = recipe && typeof recipe === 'object' ? recipe : {};
    const candidates = [
        src.title,
        src.name,
        src.hintTitle,
        src.recipe_title,
        firstMeaningfulLine(src.description),
        Array.isArray(src.ingredients) && src.ingredients[0]
            ? typeof src.ingredients[0] === 'string'
                ? firstMeaningfulLine(src.ingredients[0])
                : src.ingredients[0]?.ingredient || src.ingredients[0]?.name
            : null,
        Array.isArray(src.instructions) && src.instructions[0] ? firstMeaningfulLine(src.instructions[0]) : null,
        Array.isArray(src.steps) && src.steps[0] ? firstMeaningfulLine(src.steps[0]) : null,
    ];
    for (const c of candidates) {
        const t = coerceString(c, MAX_TITLE);
        if (t && !isPlaceholderRecipeTitle(t)) return t;
    }
    return null;
}

/**
 * @returns {string | null} usable title or null if none can be inferred
 */
export function resolveRecipeTitleForSave(recipe) {
    const inferred = inferRecipeTitle(recipe);
    if (inferred) return inferred;
    const direct = coerceString(recipe?.title ?? recipe?.name, MAX_TITLE);
    if (direct && !isPlaceholderRecipeTitle(direct)) return direct;
    return null;
}

export function recipeTitleRequiredMessage() {
    return 'This recipe needs a title before it can be saved. Tell Ampi what to call it or add more detail in the caption.';
}

export const UNTITLED_DEFAULT = RECIPE_TEMPLATE_DEFAULTS.title;
