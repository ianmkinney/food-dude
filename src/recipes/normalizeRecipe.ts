export {
    RECIPE_TEMPLATE_DEFAULTS,
    coerceNumber,
    coerceIngredientList,
    coerceStepList,
    coerceRecipeTemplateFromToolArgs,
    normalizeRecipe,
    templateToRecipeOperationsPayload,
    recipeRowLooksCorrupted,
} from '../../api/_lib/recipeNormalize.js';

export type { RecipeTemplate, RecipeIngredientTemplate, RecipeNutritionPerServing } from './recipeTemplate';
export { RECIPE_TOOL_JSON_SCHEMA } from './recipeTemplate';

export type NormalizedRecipeRow = {
    id?: number;
    title: string;
    description: string | null;
    servings: number | null;
    prep_time: number | null;
    cook_time: number | null;
    total_time: number | null;
    difficulty: string | null;
    calories: number | null;
    protein: number | null;
    carbohydrates: number | null;
    fat: number | null;
    fiber: number | null;
    sugar: number | null;
    sodium: number | null;
    ingredients: { ingredient: string; quantity: string | null; unit: string | null; section: string | null }[];
    instructions: string[];
    tags: string[];
    [key: string]: unknown;
};
