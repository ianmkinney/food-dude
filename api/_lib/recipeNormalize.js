export const RECIPE_TEMPLATE_DEFAULTS = {
  title: 'Untitled recipe',
  description: null,
  servings: null,
  prep_minutes: null,
  cook_minutes: null,
  difficulty: null,
  ingredients: [],
  steps: [],
  tags: [],
  nutrition: { calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, sugar_g: null, sodium_mg: null },
  source: null,
  ai_generated: false,
};

const MAX_TITLE = 200;
const MAX_DESC = 4000;
const MAX_STEP = 2000;
const MAX_ING_NAME = 200;

function stripFences(text) {
    let t = text.trim();
    if (t.startsWith('```')) {
        t = t.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    }
    return t;
}

function tryParseJson(value) {
    if (typeof value !== 'string') return value;
    const trimmed = stripFences(value.trim());
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        try {
            return JSON.parse(trimmed.replace(/,\s*([}\]])/g, '$1'));
        } catch {
            return value;
        }
    }
}

export function coerceNumber(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const m = value.trim().match(/-?\d+(\.\d+)?/);
        if (!m) return null;
        const n = parseFloat(m[0]);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function coerceString(value, maxLen) {
    if (value == null) return null;
    if (typeof value === 'object') {
        const o = value;
        if (typeof o.text === 'string') return coerceString(o.text, maxLen);
        if (typeof o.instruction === 'string') return coerceString(o.instruction, maxLen);
        if (typeof o.name === 'string') return coerceString(o.name, maxLen);
        return null;
    }
    const s = String(value).trim();
    if (!s) return null;
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function coerceDifficulty(value) {
    const s = coerceString(value, 32)?.toLowerCase();
    if (!s) return null;
    if (s === 'easy' || s === 'medium' || s === 'hard') return s;
    return null;
}

function linesFromText(text) {
    return text
        .split(/\r?\n|•|·|\u2022/)
        .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean);
}

export function coerceIngredientList(raw) {
    const parsed = tryParseJson(raw);
    const list = Array.isArray(parsed)
        ? parsed
        : typeof parsed === 'string'
          ? linesFromText(parsed)
          : parsed && typeof parsed === 'object'
            ? [parsed]
            : [];

    const out = [];
    for (const entry of list) {
        if (typeof entry === 'string') {
            const name = coerceString(entry, MAX_ING_NAME);
            if (name) out.push({ name, quantity: null, unit: null, note: null });
            continue;
        }
        if (!entry || typeof entry !== 'object') continue;
        const o = entry;
        let name =
            coerceString(o.name, MAX_ING_NAME) ||
            coerceString(o.ingredient, MAX_ING_NAME) ||
            coerceString(o.item, MAX_ING_NAME);
        if (name && name.startsWith('{')) {
            const parsed = tryParseJson(name);
            if (parsed && typeof parsed === 'object') {
                const inner = parsed;
                name =
                    coerceString(inner.name, MAX_ING_NAME) ||
                    coerceString(inner.ingredient, MAX_ING_NAME) ||
                    name;
            }
        }
        if (!name) continue;
        out.push({
            name,
            quantity: coerceString(o.quantity ?? o.amount ?? o.qty, 64),
            unit: coerceString(o.unit, 32),
            note: coerceString(o.note ?? o.section, 200),
        });
    }
    return out.slice(0, 80);
}

export function coerceStepList(raw) {
    const parsed = tryParseJson(raw);
    if (Array.isArray(parsed)) {
        const steps = [];
        for (const item of parsed) {
            if (item && typeof item === 'object') {
                const s = coerceString(item.instruction ?? item.text ?? item.step, MAX_STEP);
                if (s) steps.push(s);
                continue;
            }
            let s = coerceString(item, MAX_STEP);
            if (s && s.startsWith('{')) {
                const inner = tryParseJson(s);
                if (inner && typeof inner === 'object') {
                    s = coerceString(inner.instruction ?? inner.text ?? inner.step, MAX_STEP);
                }
            }
            if (s) steps.push(s);
        }
        return steps.slice(0, 60);
    }
    if (typeof parsed === 'string') {
        const maybeJson = tryParseJson(parsed);
        if (Array.isArray(maybeJson)) return coerceStepList(maybeJson);
        return linesFromText(parsed).map((s) => (s.length > MAX_STEP ? s.slice(0, MAX_STEP) : s)).slice(0, 60);
    }
    if (parsed && typeof parsed === 'object') {
        const o = parsed;
        if (Array.isArray(o.steps)) return coerceStepList(o.steps);
        if (Array.isArray(o.instructions)) return coerceStepList(o.instructions);
    }
    return [];
}

function coerceNutrition(raw, flat) {
    const base = { ...RECIPE_TEMPLATE_DEFAULTS.nutrition };
    const src =
        raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw)
            : typeof raw === 'string'
              ? (tryParseJson(raw)) || {}
              : {};

    const pick = (keys) => {
        for (const k of keys) {
            if (src[k] !== undefined) return src[k];
            if (flat[k] !== undefined) return flat[k];
        }
        return undefined;
    };

    return {
        calories: coerceNumber(pick(['calories', 'kcal'])),
        protein_g: coerceNumber(pick(['protein_g', 'protein'])),
        carbs_g: coerceNumber(pick(['carbs_g', 'carbohydrates', 'carbs'])),
        fat_g: coerceNumber(pick(['fat_g', 'fat'])),
        fiber_g: coerceNumber(pick(['fiber_g', 'fiber'])),
        sugar_g: coerceNumber(pick(['sugar_g', 'sugar'])),
        sodium_mg: coerceNumber(pick(['sodium_mg', 'sodium'])),
    };
}

/** Coerce messy tool/model args into the canonical template (no DB keys). */
export function coerceRecipeTemplateFromToolArgs(args) {
    const flat =
        args && typeof args === 'object' && !Array.isArray(args) ? (args) : {};
    const nested =
        flat.recipe && typeof flat.recipe === 'object' ? (flat.recipe) : null;
    const src = nested ? { ...flat, ...nested } : flat;

    let title = coerceString(src.title, MAX_TITLE);
    if (!title && typeof src.name === 'string') title = coerceString(src.name, MAX_TITLE);

    const description = coerceString(src.description, MAX_DESC);

    const ingredients = coerceIngredientList(src.ingredients ?? src.ingredient_list);
    const steps = coerceStepList(src.steps ?? src.instructions ?? src.directions);

    const nutrition = coerceNutrition(src.nutrition, src);

    const template = {
        ...RECIPE_TEMPLATE_DEFAULTS,
        title: title || RECIPE_TEMPLATE_DEFAULTS.title,
        description,
        servings: coerceNumber(src.servings),
        prep_minutes: coerceNumber(src.prep_minutes ?? src.prep_time ?? src.prepTime),
        cook_minutes: coerceNumber(src.cook_minutes ?? src.cook_time ?? src.cookTime),
        difficulty: coerceDifficulty(src.difficulty),
        ingredients,
        steps,
        tags: Array.isArray(src.tags)
            ? src.tags
                  .map((t) => coerceString(t, 64))
                  .filter((t) => Boolean(t))
                  .slice(0, 24)
            : [],
        nutrition,
        source: coerceString(src.source ?? src.source_platform ?? src.sourcePlatform, 500),
        ai_generated: Boolean(src.ai_generated ?? src.is_ai_generated ?? src.isAiGenerated),
    };

    return template;
}

/** DB row + children → safe shape for UI and updates. */
export function normalizeRecipe(row) {
    if (!row) return null;

    const titleRaw = row.title;
    let title = null;
    if (typeof titleRaw === 'string' && titleRaw.trim().startsWith('{')) {
        const parsed = tryParseJson(titleRaw);
        if (parsed && typeof parsed === 'object') {
            title = coerceRecipeTemplateFromToolArgs(parsed).title;
        }
    }
    if (!title) title = coerceString(titleRaw, MAX_TITLE);
    if (!title) title = RECIPE_TEMPLATE_DEFAULTS.title;

    let description = coerceString(row.description, MAX_DESC);
    if (description && description.startsWith('{') && description.includes('"ingredients"')) {
        const parsed = tryParseJson(description);
        if (parsed && typeof parsed === 'object') {
            description = coerceString((parsed).description, MAX_DESC);
        }
    }

    const rawIngredients = row.ingredients;
    let ingredients;
    if (Array.isArray(rawIngredients)) {
        ingredients = coerceIngredientList(rawIngredients).map((ing) => ({
            ingredient: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            section: ing.note,
        }));
    } else if (typeof rawIngredients === 'string') {
        ingredients = coerceIngredientList(rawIngredients).map((ing) => ({
            ingredient: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            section: ing.note,
        }));
    } else {
        ingredients = [];
    }

    const rawInstructions = row.instructions;
    let instructions = coerceStepList(rawInstructions);
    if (!instructions.length && Array.isArray(rawInstructions)) {
        instructions = rawInstructions
            .map((step) => {
                if (typeof step === 'string') return coerceString(step, MAX_STEP);
                if (step && typeof step === 'object') {
                    const o = step;
                    return coerceString(o.instruction ?? o.text ?? o.step, MAX_STEP);
                }
                return null;
            })
            .filter((s) => Boolean(s));
    }

    const nutrition = coerceNutrition(row.nutrition, row);

    const prep = coerceNumber(row.prep_time ?? row.prepTime);
    const cook = coerceNumber(row.cook_time ?? row.cookTime);
    const total = coerceNumber(row.total_time ?? row.totalTime) ?? (prep && cook ? prep + cook : prep || cook);

    return {
        ...row,
        title,
        description,
        servings: coerceNumber(row.servings),
        prep_time: prep,
        cook_time: cook,
        total_time: total,
        difficulty: coerceDifficulty(row.difficulty),
        calories: nutrition.calories ?? coerceNumber(row.calories),
        protein: nutrition.protein_g ?? coerceNumber(row.protein),
        carbohydrates: nutrition.carbs_g ?? coerceNumber(row.carbohydrates),
        fat: nutrition.fat_g ?? coerceNumber(row.fat),
        fiber: nutrition.fiber_g ?? coerceNumber(row.fiber),
        sugar: nutrition.sugar_g ?? coerceNumber(row.sugar),
        sodium: nutrition.sodium_mg ?? coerceNumber(row.sodium),
        ingredients,
        instructions,
        tags: Array.isArray(row.tags)
            ? row.tags.map((t) => coerceString(t, 64)).filter((t) => Boolean(t))
            : [],
    };
}

/** Map canonical template → recipeOperations.create / update payload. */
export function templateToRecipeOperationsPayload(template) {
    const prep = template.prep_minutes;
    const cook = template.cook_minutes;
    return {
        title: template.title,
        description: template.description,
        servings: template.servings,
        prepTime: prep,
        cookTime: cook,
        totalTime: prep && cook ? prep + cook : prep || cook || null,
        difficulty: template.difficulty,
        sourcePlatform: template.source,
        calories: template.nutrition.calories,
        protein: template.nutrition.protein_g,
        carbohydrates: template.nutrition.carbs_g,
        fat: template.nutrition.fat_g,
        fiber: template.nutrition.fiber_g,
        sugar: template.nutrition.sugar_g,
        sodium: template.nutrition.sodium_mg,
        nutritionAiEstimate: template.ai_generated ? 1 : 0,
        ingredients: template.ingredients.map((ing) => ({
            ingredient: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            section: ing.note,
        })),
        instructions: template.steps,
        tags: template.tags,
    };
}

export function recipeRowLooksCorrupted(row, ingredients, instructions) {
    if (typeof row.title === 'string' && row.title.trim().startsWith('{') && row.title.includes('"ingredients"')) return true;
    if (typeof row.description === 'string' && row.description.trim().startsWith('{') && row.description.includes('"steps"')) return true;
    if (!Array.isArray(ingredients) && typeof row.ingredients === 'string') return true;
    if (!Array.isArray(instructions) && typeof row.instructions === 'string') return true;
    for (const ing of ingredients) {
        if (!ing || typeof ing !== 'object') return true;
        const o = ing;
        if (o.ingredient != null && typeof o.ingredient !== 'string') return true;
        if (o.quantity != null && typeof o.quantity !== 'string' && typeof o.quantity !== 'number') return true;
    }
    for (const step of instructions) {
        if (step != null && typeof step !== 'string' && typeof step !== 'object') return true;
    }
    return false;
}
