import {
    coerceRecipeTemplateFromToolArgs,
    normalizeRecipe,
    recipeRowLooksCorrupted,
    templateToRecipeOperationsPayload,
} from '../../api/_lib/recipeNormalize.js';

async function loadRecipeBundle(db, id) {
    const recipe = await db.getFirstAsync('SELECT * FROM recipes WHERE id = ?', [id]);
    if (!recipe) return null;
    const ingredients = await db.getAllAsync(
        'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY order_index',
        [id]
    );
    const instructionRows = await db.getAllAsync(
        'SELECT * FROM recipe_instructions WHERE recipe_id = ? ORDER BY step_number',
        [id]
    );
    const tags = await db.getAllAsync('SELECT tag FROM recipe_tags WHERE recipe_id = ?', [id]);
    return {
        ...recipe,
        ingredients,
        instructions: instructionRows.map((r) => r.instruction),
        tags: tags.map((t) => t.tag),
    };
}

async function persistNormalized(db, id, normalized) {
    const now = Date.now();
    await db.runAsync(
        `UPDATE recipes SET
      title = ?, description = ?, servings = ?, prep_time = ?, cook_time = ?, total_time = ?, difficulty = ?,
      calories = ?, protein = ?, carbohydrates = ?, fat = ?, fiber = ?, sugar = ?, sodium = ?,
      updated_at = ?
     WHERE id = ?`,
        [
            normalized.title,
            normalized.description,
            normalized.servings,
            normalized.prep_time,
            normalized.cook_time,
            normalized.total_time,
            normalized.difficulty,
            normalized.calories,
            normalized.protein,
            normalized.carbohydrates,
            normalized.fat,
            normalized.fiber,
            normalized.sugar,
            normalized.sodium,
            now,
            id,
        ]
    );
    await db.runAsync('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
    for (let i = 0; i < normalized.ingredients.length; i++) {
        const ing = normalized.ingredients[i];
        await db.runAsync(
            `INSERT INTO recipe_ingredients (recipe_id, ingredient, quantity, unit, section, order_index)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [id, ing.ingredient, ing.quantity, ing.unit, ing.section, i]
        );
    }
    await db.runAsync('DELETE FROM recipe_instructions WHERE recipe_id = ?', [id]);
    for (let i = 0; i < normalized.instructions.length; i++) {
        await db.runAsync(
            `INSERT INTO recipe_instructions (recipe_id, step_number, instruction) VALUES (?, ?, ?)`,
            [id, i + 1, normalized.instructions[i]]
        );
    }
}

/**
 * Idempotent repair for recipes saved with raw model JSON in scalar fields or child rows.
 * @param {import('expo-sqlite').SQLiteDatabase} db
 */
export async function repairCorruptedRecipesInDb(db) {
    const rows = await db.getAllAsync('SELECT id FROM recipes');
    let repaired = 0;
    for (const { id } of rows) {
        const bundle = await loadRecipeBundle(db, id);
        if (!bundle) continue;
        const needsRepair = recipeRowLooksCorrupted(bundle, bundle.ingredients || [], bundle.instructions || []);
        if (!needsRepair) continue;

        let normalized = normalizeRecipe(bundle);
        if (!normalized) continue;

        if (typeof bundle.title === 'string' && bundle.title.trim().startsWith('{')) {
            try {
                const template = coerceRecipeTemplateFromToolArgs(JSON.parse(bundle.title.trim()));
                const payload = templateToRecipeOperationsPayload(template);
                normalized = normalizeRecipe({
                    ...bundle,
                    ...payload,
                    ingredients: payload.ingredients,
                    instructions: payload.instructions,
                });
            } catch {
                // fall back to row-level normalize only
            }
        }

        if (normalized) {
            await persistNormalized(db, id, normalized);
            repaired += 1;
        }
    }
    if (repaired) {
        console.log(`[migration] repaired ${repaired} corrupted recipe(s)`);
    }
}
