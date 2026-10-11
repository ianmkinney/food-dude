export const MAX_SYNC_RECORD_BYTES = 256 * 1024;
export const MAX_SYNC_PUSH_RECORDS = 80;
export const MAX_SYNC_PULL_RECORDS = 200;

export const SYNC_COLLECTIONS = new Set([
    'recipes',
    'recipe_ingredients',
    'recipe_instructions',
    'recipe_tags',
    'meal_plans',
    'pantry_items',
    'grocery_items',
    'users',
    'memories',
    'chat_threads',
    'chat_messages',
    'app_settings',
]);
