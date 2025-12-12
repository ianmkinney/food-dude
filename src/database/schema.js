// SQLite Database Schema for Food Dude

export const createTablesSQL = `
  -- Recipes table
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    source_url TEXT,
    source_platform TEXT,
    image_uri TEXT,
    servings INTEGER,
    prep_time INTEGER,
    cook_time INTEGER,
    total_time INTEGER,
    difficulty TEXT,
    cuisine TEXT,
    notes TEXT,
    is_cooked INTEGER DEFAULT 0,
    date_added TEXT,
    -- Nutritional information (per serving)
    calories REAL,
    protein REAL,
    carbohydrates REAL,
    fat REAL,
    fiber REAL,
    sugar REAL,
    sodium REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Recipe ingredients table
  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    ingredient TEXT NOT NULL,
    quantity TEXT,
    unit TEXT,
    section TEXT,
    order_index INTEGER,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  );

  -- Recipe instructions table
  CREATE TABLE IF NOT EXISTS recipe_instructions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    step_number INTEGER NOT NULL,
    instruction TEXT NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  );

  -- Recipe tags table
  CREATE TABLE IF NOT EXISTS recipe_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  );

  -- Meal plans table
  CREATE TABLE IF NOT EXISTS meal_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner')),
    servings INTEGER DEFAULT 1,
    notes TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  );

  -- Pantry items table
  CREATE TABLE IF NOT EXISTS pantry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    quantity REAL,
    unit TEXT,
    barcode TEXT,
    image_uri TEXT,
    expiration_date TEXT,
    location TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Grocery list items table
  CREATE TABLE IF NOT EXISTS grocery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    quantity TEXT,
    unit TEXT,
    category TEXT,
    recipe_id INTEGER,
    recipe_name TEXT,
    is_checked INTEGER DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
  );

  -- AI Chef conversations table
  CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    media_uri TEXT,
    media_type TEXT,
    created_at INTEGER NOT NULL
  );

  -- Parties table
  CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_by TEXT,
    scheduled_date TEXT,
    scheduled_meal_type TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Party members table
  CREATE TABLE IF NOT EXISTS party_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT,
    role TEXT DEFAULT 'member' CHECK(role IN ('owner', 'member')),
    joined_at INTEGER NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
  );

  -- Party meals table (meals created for parties)
  CREATE TABLE IF NOT EXISTS party_meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    recipe_ids TEXT, -- JSON array of recipe IDs
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
  );

  -- Party meal ingredient claims table
  CREATE TABLE IF NOT EXISTS party_meal_ingredient_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_meal_id INTEGER NOT NULL,
    recipe_id INTEGER NOT NULL,
    ingredient_name TEXT NOT NULL,
    claimed_by_user_id TEXT NOT NULL,
    claimed_by_user_name TEXT,
    pantry_item_id INTEGER,
    claimed_at INTEGER NOT NULL,
    FOREIGN KEY (party_meal_id) REFERENCES party_meals(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  );

  -- Users/Account table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    name TEXT,
    username TEXT,
    email TEXT,
    avatar_uri TEXT,
    recipes_cooked INTEGER DEFAULT 0,
    flavor_preferences TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Recipe cooking history table
  CREATE TABLE IF NOT EXISTS recipe_cooking_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    cooked_at INTEGER NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  );

  -- Create indexes for better query performance
  CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_meal_plans_date ON meal_plans(date);
  CREATE INDEX IF NOT EXISTS idx_grocery_items_checked ON grocery_items(is_checked);
  CREATE INDEX IF NOT EXISTS idx_pantry_items_category ON pantry_items(category);
  CREATE INDEX IF NOT EXISTS idx_party_members_party_id ON party_members(party_id);
  CREATE INDEX IF NOT EXISTS idx_party_meals_party_id ON party_meals(party_id);
`;

export const dropTablesSQL = `
  DROP TABLE IF EXISTS recipe_cooking_history;
  DROP TABLE IF EXISTS party_meals;
  DROP TABLE IF EXISTS party_members;
  DROP TABLE IF EXISTS parties;
  DROP TABLE IF EXISTS users;
  DROP TABLE IF EXISTS ai_conversations;
  DROP TABLE IF EXISTS grocery_items;
  DROP TABLE IF EXISTS pantry_items;
  DROP TABLE IF EXISTS meal_plans;
  DROP TABLE IF EXISTS recipe_tags;
  DROP TABLE IF EXISTS recipe_instructions;
  DROP TABLE IF EXISTS recipe_ingredients;
  DROP TABLE IF EXISTS recipes;
`;
