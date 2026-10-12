/** Canonical in-app recipe shape (values only — defaults applied in normalize/coerce). */

export type RecipeIngredientTemplate = {
    name: string;
    quantity: string | null;
    unit: string | null;
    note: string | null;
};

export type RecipeNutritionPerServing = {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
};

export type RecipeTemplate = {
    title: string;
    description: string | null;
    servings: number | null;
    prep_minutes: number | null;
    cook_minutes: number | null;
    difficulty: string | null;
    ingredients: RecipeIngredientTemplate[];
    steps: string[];
    tags: string[];
    nutrition: RecipeNutritionPerServing;
    source: string | null;
    ai_generated: boolean;
};

export const RECIPE_TEMPLATE_DEFAULTS: RecipeTemplate = {
    title: 'Untitled recipe',
    description: null,
    servings: null,
    prep_minutes: null,
    cook_minutes: null,
    difficulty: null,
    ingredients: [],
    steps: [],
    tags: [],
    nutrition: {
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        fiber_g: null,
        sugar_g: null,
        sodium_mg: null,
    },
    source: null,
    ai_generated: false,
};

/** OpenRouter / tool JSON schema (strict-friendly subset). */
export const RECIPE_TOOL_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'ingredients', 'steps'],
    properties: {
        title: { type: 'string', maxLength: 200 },
        description: { type: 'string', maxLength: 4000 },
        servings: { type: 'number' },
        prep_minutes: { type: 'number' },
        cook_minutes: { type: 'number' },
        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        ingredients: {
            type: 'array',
            maxItems: 80,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name'],
                properties: {
                    name: { type: 'string', maxLength: 200 },
                    quantity: { type: 'string', maxLength: 64 },
                    unit: { type: 'string', maxLength: 32 },
                    note: { type: 'string', maxLength: 200 },
                },
            },
        },
        steps: {
            type: 'array',
            maxItems: 60,
            items: { type: 'string', maxLength: 2000 },
        },
        tags: {
            type: 'array',
            maxItems: 24,
            items: { type: 'string', maxLength: 64 },
        },
        nutrition: {
            type: 'object',
            additionalProperties: false,
            properties: {
                calories: { type: 'number' },
                protein_g: { type: 'number' },
                carbs_g: { type: 'number' },
                fat_g: { type: 'number' },
                fiber_g: { type: 'number' },
                sugar_g: { type: 'number' },
                sodium_mg: { type: 'number' },
            },
        },
        source: { type: 'string', maxLength: 500 },
        ai_generated: { type: 'boolean' },
    },
} as const;
