import { getDatabase } from '../database/operations';

/**
 * Web test fixture: one intentionally messy recipe row (pre-normalize corruption patterns).
 */
export async function runCorruptRecipeFixtureSeed() {
    const db = getDatabase();
    const now = Date.now();
    const existing = await db.getFirstAsync(
        "SELECT id FROM recipes WHERE title = '__corrupt_fixture__' LIMIT 1"
    );
    if (existing?.id) {
        globalThis.__TEST_CORRUPT_RECIPE_ID__ = existing.id;
        return existing.id;
    }

    const result = await db.runAsync(
        `INSERT INTO recipes (title, description, servings, prep_time, cook_time, total_time, difficulty,
      calories, protein, carbohydrates, fat, created_at, updated_at, source_platform, is_ai_generated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            '__corrupt_fixture__',
            '{"ingredients":[{"name":"flour"}],"steps":["Mix"]}',
            '4',
            null,
            null,
            null,
            'medium',
            '{"calories":320}',
            null,
            null,
            null,
            now,
            now,
            'Ampi',
            1,
        ]
    );
    const recipeId = result.lastInsertRowId;
    await db.runAsync(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient, quantity, unit, order_index)
     VALUES (?, ?, ?, ?, 0)`,
        [recipeId, '{"name":"eggs","quantity":"2"}', '[object Object]', null]
    );
    await db.runAsync(
        `INSERT INTO recipe_instructions (recipe_id, step_number, instruction) VALUES (?, 1, ?)`,
        [recipeId, '{"instruction":"Whisk eggs"}']
    );
    globalThis.__TEST_CORRUPT_RECIPE_ID__ = recipeId;
    return recipeId;
}
