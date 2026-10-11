/** SQLite tables included in encrypted cloud sync (never API keys / party secrets). */
export const SYNC_COLLECTIONS = [
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
] as const;

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

const APP_SETTINGS_DENY = [
    'amplifood.elevenlabs',
    'amplifood.owner.session',
    'openrouter',
    'byok',
    'api_key',
    'apikey',
];

export function isSyncableAppSettingKey(key: string): boolean {
    const lower = key.toLowerCase();
    return !APP_SETTINGS_DENY.some((part) => lower.includes(part));
}

export const SYNC_TABLE_META: Record<
    SyncCollection,
    { table: string; idColumn: string; updatedExpr: string }
> = {
    recipes: { table: 'recipes', idColumn: 'id', updatedExpr: 'COALESCE(NEW.updated_at, NEW.created_at)' },
    recipe_ingredients: { table: 'recipe_ingredients', idColumn: 'id', updatedExpr: 'CAST((strftime(\'%s\',\'now\') * 1000) AS INTEGER)' },
    recipe_instructions: { table: 'recipe_instructions', idColumn: 'id', updatedExpr: 'CAST((strftime(\'%s\',\'now\') * 1000) AS INTEGER)' },
    recipe_tags: { table: 'recipe_tags', idColumn: 'id', updatedExpr: 'CAST((strftime(\'%s\',\'now\') * 1000) AS INTEGER)' },
    meal_plans: { table: 'meal_plans', idColumn: 'id', updatedExpr: 'COALESCE(NEW.created_at, CAST((strftime(\'%s\',\'now\') * 1000) AS INTEGER))' },
    pantry_items: { table: 'pantry_items', idColumn: 'id', updatedExpr: 'COALESCE(NEW.updated_at, NEW.created_at)' },
    grocery_items: { table: 'grocery_items', idColumn: 'id', updatedExpr: 'COALESCE(NEW.created_at, CAST((strftime(\'%s\',\'now\') * 1000) AS INTEGER))' },
    users: { table: 'users', idColumn: 'id', updatedExpr: 'COALESCE(NEW.updated_at, NEW.created_at)' },
    memories: { table: 'memories', idColumn: 'id', updatedExpr: 'COALESCE(NEW.updated_at, NEW.created_at)' },
    chat_threads: { table: 'chat_threads', idColumn: 'id', updatedExpr: 'COALESCE(NEW.updated_at, CAST((strftime(\'%s\',\'now\') * 1000) AS INTEGER))' },
    chat_messages: { table: 'chat_messages', idColumn: 'id', updatedExpr: 'COALESCE(NEW.created_at, CAST((strftime(\'%s\',\'now\') * 1000) AS INTEGER))' },
    app_settings: { table: 'app_settings', idColumn: 'key', updatedExpr: 'COALESCE(NEW.updated_at, CAST((strftime(\'%s\',\'now\') * 1000) AS INTEGER))' },
};
