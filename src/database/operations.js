import * as SQLite from 'expo-sqlite';
import { runMigrations, ensureRequiredColumns } from './migrations';

let db = null;

// Initialize database
export const initDatabase = async () => {
    try {
        db = await SQLite.openDatabaseAsync('fooddude.db');
        await db.execAsync('PRAGMA foreign_keys = ON;');
        const version = await runMigrations(db);
        await ensureRequiredColumns(db);
        console.log(`Galaxy Health database ready at schema v${version}`);
        return db;
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
};

// Get database instance
export const getDatabase = () => {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
};

// Recipe operations
export const recipeOperations = {
    // Create a new recipe
    async create(recipe) {
        const db = getDatabase();
        const now = Date.now();

        try {
            // Format date_added - use provided date or default to today
            const dateAdded = recipe.dateAdded || new Date().toISOString().split('T')[0];
            
            const result = await db.runAsync(
                `INSERT INTO recipes (title, description, source_url, source_platform, image_uri, 
         servings, prep_time, cook_time, total_time, difficulty, cuisine, notes, is_cooked, date_added,
         calories, protein, carbohydrates, fat, fiber, sugar, sodium, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    recipe.title,
                    recipe.description || null,
                    recipe.sourceUrl || null,
                    recipe.sourcePlatform || null,
                    recipe.imageUri || null,
                    recipe.servings || null,
                    recipe.prepTime || null,
                    recipe.cookTime || null,
                    recipe.totalTime || null,
                    recipe.difficulty || null,
                    recipe.cuisine || null,
                    recipe.notes || null,
                    recipe.isCooked ? 1 : 0,
                    dateAdded,
                    recipe.calories || null,
                    recipe.protein || null,
                    recipe.carbohydrates || null,
                    recipe.fat || null,
                    recipe.fiber || null,
                    recipe.sugar || null,
                    recipe.sodium || null,
                    now,
                    now,
                ]
            );

            const recipeId = result.lastInsertRowId;

            // Insert ingredients
            if (recipe.ingredients && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
                // Filter out ingredients with empty or null ingredient name
                const validIngredients = recipe.ingredients.filter(ing => 
                    ing && ing.ingredient && typeof ing.ingredient === 'string' && ing.ingredient.trim() !== ''
                );
                for (let i = 0; i < validIngredients.length; i++) {
                    const ing = validIngredients[i];
                    await db.runAsync(
                        `INSERT INTO recipe_ingredients (recipe_id, ingredient, quantity, unit, section, order_index)
             VALUES (?, ?, ?, ?, ?, ?)`,
                        [recipeId, ing.ingredient.trim(), ing.quantity || null, ing.unit || null, ing.section || null, i]
                    );
                }
            }

            // Insert instructions
            if (recipe.instructions && Array.isArray(recipe.instructions) && recipe.instructions.length > 0) {
                // Filter out empty instructions
                const validInstructions = recipe.instructions.filter(inst => 
                    inst && typeof inst === 'string' && inst.trim() !== ''
                );
                for (let i = 0; i < validInstructions.length; i++) {
                    await db.runAsync(
                        `INSERT INTO recipe_instructions (recipe_id, step_number, instruction)
             VALUES (?, ?, ?)`,
                        [recipeId, i + 1, validInstructions[i].trim()]
                    );
                }
            }

            // Insert tags
            if (recipe.tags && recipe.tags.length > 0) {
                for (const tag of recipe.tags) {
                    await db.runAsync(
                        `INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, ?)`,
                        [recipeId, tag]
                    );
                }
            }

            return recipeId;
        } catch (error) {
            console.error('Error creating recipe:', error);
            throw error;
        }
    },

    // Get all recipes
    async getAll(filters = {}) {
        const db = getDatabase();
        try {
            let query = 'SELECT * FROM recipes WHERE 1=1';
            const params = [];
            
            if (filters.isCooked !== undefined) {
                query += ' AND is_cooked = ?';
                params.push(filters.isCooked ? 1 : 0);
            }
            
            if (filters.dateAdded) {
                query += ' AND date_added = ?';
                params.push(filters.dateAdded);
            }
            
            if (filters.sortBy === 'date_added') {
                query += ' ORDER BY date_added DESC';
            } else if (filters.sortBy === 'is_cooked') {
                query += ' ORDER BY is_cooked ASC, created_at DESC';
            } else {
                query += ' ORDER BY created_at DESC';
            }
            
            const recipes = await db.getAllAsync(query, params);
            return recipes;
        } catch (error) {
            console.error('Error getting recipes:', error);
            throw error;
        }
    },

    // Get recipe by ID with full details
    async getById(id) {
        const db = getDatabase();
        try {
            const recipe = await db.getFirstAsync(
                'SELECT * FROM recipes WHERE id = ?',
                [id]
            );

            if (!recipe) return null;

            // Get ingredients
            const ingredients = await db.getAllAsync(
                'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY order_index',
                [id]
            );

            // Get instructions
            const instructions = await db.getAllAsync(
                'SELECT * FROM recipe_instructions WHERE recipe_id = ? ORDER BY step_number',
                [id]
            );

            // Get tags
            const tags = await db.getAllAsync(
                'SELECT tag FROM recipe_tags WHERE recipe_id = ?',
                [id]
            );

            return {
                ...recipe,
                ingredients,
                instructions: instructions.map(i => i.instruction),
                tags: tags.map(t => t.tag),
            };
        } catch (error) {
            console.error('Error getting recipe by ID:', error);
            throw error;
        }
    },

    // Search recipes
    async search(query) {
        const db = getDatabase();
        try {
            const recipes = await db.getAllAsync(
                `SELECT DISTINCT r.* FROM recipes r
         LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
         LEFT JOIN recipe_tags rt ON r.id = rt.recipe_id
         WHERE r.title LIKE ? OR r.description LIKE ? OR ri.ingredient LIKE ? OR rt.tag LIKE ?
         ORDER BY r.created_at DESC`,
                [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]
            );
            return recipes;
        } catch (error) {
            console.error('Error searching recipes:', error);
            throw error;
        }
    },

    // Update recipe
    async update(id, updates) {
        const db = getDatabase();
        const now = Date.now();

        try {
            // Get current recipe to preserve values not being updated
            const current = await db.getFirstAsync('SELECT * FROM recipes WHERE id = ?', [id]);
            if (!current) {
                throw new Error('Recipe not found');
            }

            // Update main recipe table - use provided values or keep existing ones
            await db.runAsync(
                `UPDATE recipes SET 
                    title = ?, 
                    description = ?, 
                    image_uri = ?,
                    servings = ?,
                    prep_time = ?,
                    cook_time = ?,
                    total_time = ?,
                    difficulty = ?,
                    cuisine = ?,
                    notes = ?,
                    is_cooked = ?,
                    date_added = ?,
                    calories = ?,
                    protein = ?,
                    carbohydrates = ?,
                    fat = ?,
                    fiber = ?,
                    sugar = ?,
                    sodium = ?,
                    updated_at = ?
                 WHERE id = ?`,
                [
                    updates.title !== undefined ? updates.title : current.title,
                    updates.description !== undefined ? (updates.description ?? null) : current.description,
                    (updates.imageUri !== undefined || updates.image_uri !== undefined) 
                        ? (updates.imageUri ?? updates.image_uri ?? null) 
                        : current.image_uri,
                    updates.servings !== undefined ? (updates.servings ?? null) : current.servings,
                    updates.prepTime !== undefined ? (updates.prepTime ?? null) : current.prep_time,
                    updates.cookTime !== undefined ? (updates.cookTime ?? null) : current.cook_time,
                    updates.totalTime !== undefined ? (updates.totalTime ?? null) : current.total_time,
                    updates.difficulty !== undefined ? (updates.difficulty ?? null) : current.difficulty,
                    updates.cuisine !== undefined ? (updates.cuisine ?? null) : current.cuisine,
                    updates.notes !== undefined ? (updates.notes ?? null) : current.notes,
                    updates.isCooked !== undefined ? (updates.isCooked ? 1 : 0) : (current.is_cooked || 0),
                    updates.dateAdded !== undefined ? (updates.dateAdded ?? null) : current.date_added,
                    updates.calories !== undefined ? (updates.calories ?? null) : (current.calories ?? null),
                    updates.protein !== undefined ? (updates.protein ?? null) : (current.protein ?? null),
                    updates.carbohydrates !== undefined ? (updates.carbohydrates ?? null) : (current.carbohydrates ?? null),
                    updates.fat !== undefined ? (updates.fat ?? null) : (current.fat ?? null),
                    updates.fiber !== undefined ? (updates.fiber ?? null) : (current.fiber ?? null),
                    updates.sugar !== undefined ? (updates.sugar ?? null) : (current.sugar ?? null),
                    updates.sodium !== undefined ? (updates.sodium ?? null) : (current.sodium ?? null),
                    now,
                    id
                ]
            );

            // Update Ingredients (Delete all and re-insert)
            if (updates.ingredients && Array.isArray(updates.ingredients)) {
                await db.runAsync('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
                // Filter out ingredients with empty or null ingredient name
                const validIngredients = updates.ingredients.filter(ing => 
                    ing && ing.ingredient && typeof ing.ingredient === 'string' && ing.ingredient.trim() !== ''
                );
                for (let i = 0; i < validIngredients.length; i++) {
                    const ing = validIngredients[i];
                    await db.runAsync(
                        `INSERT INTO recipe_ingredients (recipe_id, ingredient, quantity, unit, section, order_index)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [id, ing.ingredient.trim(), ing.quantity || null, ing.unit || null, ing.section || null, i]
                    );
                }
            }

            // Update Instructions (Delete all and re-insert)
            if (updates.instructions && Array.isArray(updates.instructions)) {
                await db.runAsync('DELETE FROM recipe_instructions WHERE recipe_id = ?', [id]);
                // Filter out empty instructions
                const validInstructions = updates.instructions.filter(inst => 
                    inst && typeof inst === 'string' && inst.trim() !== ''
                );
                for (let i = 0; i < validInstructions.length; i++) {
                    await db.runAsync(
                        `INSERT INTO recipe_instructions (recipe_id, step_number, instruction)
                         VALUES (?, ?, ?)`,
                        [id, i + 1, validInstructions[i].trim()]
                    );
                }
            }

            // Update Tags
            if (updates.tags) {
                await db.runAsync('DELETE FROM recipe_tags WHERE recipe_id = ?', [id]);
                for (const tag of updates.tags) {
                    await db.runAsync(
                        `INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, ?)`,
                        [id, tag]
                    );
                }
            }

            return true;
        } catch (error) {
            console.error('Error updating recipe:', error);
            throw error;
        }
    },

    // Delete recipe
    async delete(id) {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM recipes WHERE id = ?', [id]);
            return true;
        } catch (error) {
            console.error('Error deleting recipe:', error);
            throw error;
        }
    },
};

// Meal plan operations
export const mealPlanOperations = {
    // Add meal to plan
    async add(mealPlan) {
        const db = getDatabase();
        const now = Date.now();

        try {
            const result = await db.runAsync(
                `INSERT INTO meal_plans (recipe_id, date, meal_type, servings, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [mealPlan.recipeId, mealPlan.date, mealPlan.mealType, mealPlan.servings || 1, mealPlan.notes || null, now]
            );
            return result.lastInsertRowId;
        } catch (error) {
            console.error('Error adding meal plan:', error);
            throw error;
        }
    },

    // Get meals for date range
    async getByDateRange(startDate, endDate) {
        const db = getDatabase();
        try {
            const meals = await db.getAllAsync(
                `SELECT mp.*, r.title, r.image_uri 
         FROM meal_plans mp
         JOIN recipes r ON mp.recipe_id = r.id
         WHERE mp.date >= ? AND mp.date <= ?
         ORDER BY mp.date, 
           CASE mp.meal_type 
             WHEN 'breakfast' THEN 1 
             WHEN 'lunch' THEN 2 
             WHEN 'dinner' THEN 3 
           END`,
                [startDate, endDate]
            );
            return meals;
        } catch (error) {
            console.error('Error getting meal plans:', error);
            throw error;
        }
    },

    // Delete meal from plan
    async delete(id) {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM meal_plans WHERE id = ?', [id]);
            return true;
        } catch (error) {
            console.error('Error deleting meal plan:', error);
            throw error;
        }
    },
};

// Pantry operations
export const pantryOperations = {
    // Add pantry item
    async add(item) {
        const db = getDatabase();
        const now = Date.now();

        try {
            const result = await db.runAsync(
                `INSERT INTO pantry_items (name, category, quantity, unit, barcode, image_uri, 
         expiration_date, location, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    item.name,
                    item.category || null,
                    item.quantity || null,
                    item.unit || null,
                    item.barcode || null,
                    item.imageUri || null,
                    item.expirationDate || null,
                    item.location || null,
                    item.notes || null,
                    now,
                    now,
                ]
            );
            return result.lastInsertRowId;
        } catch (error) {
            console.error('Error adding pantry item:', error);
            throw error;
        }
    },

    // Get all pantry items
    async getAll() {
        const db = getDatabase();
        try {
            const items = await db.getAllAsync(
                'SELECT * FROM pantry_items ORDER BY category, name'
            );
            return items;
        } catch (error) {
            console.error('Error getting pantry items:', error);
            throw error;
        }
    },

    // Update pantry item
    async update(id, updates) {
        const db = getDatabase();
        const now = Date.now();

        try {
            await db.runAsync(
                `UPDATE pantry_items SET 
                    name = ?,
                    category = ?,
                    quantity = ?,
                    unit = ?,
                    barcode = ?,
                    image_uri = ?,
                    expiration_date = ?,
                    location = ?,
                    notes = ?,
                    updated_at = ?
         WHERE id = ?`,
                [
                    updates.name,
                    updates.category || null,
                    updates.quantity || null,
                    updates.unit || null,
                    updates.barcode || null,
                    updates.imageUri || null,
                    updates.expirationDate || null,
                    updates.location || null,
                    updates.notes || null,
                    now,
                    id
                ]
            );
            return true;
        } catch (error) {
            console.error('Error updating pantry item:', error);
            throw error;
        }
    },

    // Delete pantry item
    async delete(id) {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM pantry_items WHERE id = ?', [id]);
            return true;
        } catch (error) {
            console.error('Error deleting pantry item:', error);
            throw error;
        }
    },
};

// Grocery list operations
export const groceryOperations = {
    // Add grocery item
    async add(item) {
        const db = getDatabase();
        const now = Date.now();

        try {
            const result = await db.runAsync(
                `INSERT INTO grocery_items (name, quantity, unit, category, recipe_id, recipe_name, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    item.name,
                    item.quantity || null,
                    item.unit || null,
                    item.category || null,
                    item.recipeId || null,
                    item.recipeName || null,
                    item.notes || null,
                    now,
                ]
            );
            return result.lastInsertRowId;
        } catch (error) {
            console.error('Error adding grocery item:', error);
            throw error;
        }
    },

    // Get all grocery items
    async getAll() {
        try {
            const db = getDatabase();
            const items = await db.getAllAsync(
                'SELECT * FROM grocery_items ORDER BY is_checked, category, name'
            );
            return items || [];
        } catch (error) {
            console.error('Error getting grocery items:', error);
            // Return empty array instead of throwing to prevent cascading errors
            return [];
        }
    },

    // Toggle item checked status
    async toggleChecked(id) {
        const db = getDatabase();
        try {
            await db.runAsync(
                'UPDATE grocery_items SET is_checked = NOT is_checked WHERE id = ?',
                [id]
            );
            return true;
        } catch (error) {
            console.error('Error toggling grocery item:', error);
            throw error;
        }
    },

    // Delete grocery item
    async delete(id) {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM grocery_items WHERE id = ?', [id]);
            return true;
        } catch (error) {
            console.error('Error deleting grocery item:', error);
            throw error;
        }
    },

    // Clear all checked items
    async clearChecked() {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM grocery_items WHERE is_checked = 1');
            return true;
        } catch (error) {
            console.error('Error clearing checked items:', error);
            throw error;
        }
    },

    // Clear all grocery items
    async clearAll() {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM grocery_items');
            return true;
        } catch (error) {
            console.error('Error clearing all grocery items:', error);
            throw error;
        }
    },
};

// AI conversation operations
export const aiConversationOperations = {
    // Add message
    async add(message) {
        const db = getDatabase();
        const now = Date.now();

        try {
            const result = await db.runAsync(
                `INSERT INTO ai_conversations (message, role, media_uri, media_type, created_at)
         VALUES (?, ?, ?, ?, ?)`,
                [message.message, message.role, message.mediaUri || null, message.mediaType || null, now]
            );
            return result.lastInsertRowId;
        } catch (error) {
            console.error('Error adding AI message:', error);
            throw error;
        }
    },

    // Get all messages
    async getAll() {
        const db = getDatabase();
        try {
            const messages = await db.getAllAsync(
                'SELECT * FROM ai_conversations ORDER BY created_at ASC'
            );
            return messages;
        } catch (error) {
            console.error('Error getting AI messages:', error);
            throw error;
        }
    },

    // Clear conversation
    async clear() {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM ai_conversations');
            return true;
        } catch (error) {
            console.error('Error clearing AI conversation:', error);
            throw error;
        }
    },
};

// Party operations
export const partyOperations = {
    // Create a new party
    async create(party) {
        const db = getDatabase();
        const now = Date.now();

        try {
            const result = await db.runAsync(
                `INSERT INTO parties (name, description, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
                [party.name, party.description || null, party.createdBy || null, now, now]
            );
            return result.lastInsertRowId;
        } catch (error) {
            console.error('Error creating party:', error);
            throw error;
        }
    },

    // Get all parties
    async getAll() {
        const db = getDatabase();
        try {
            const parties = await db.getAllAsync(
                'SELECT * FROM parties ORDER BY created_at DESC'
            );
            return parties;
        } catch (error) {
            console.error('Error getting parties:', error);
            throw error;
        }
    },

    // Get party by ID
    async getById(id) {
        const db = getDatabase();
        try {
            const party = await db.getFirstAsync(
                'SELECT * FROM parties WHERE id = ?',
                [id]
            );
            return party;
        } catch (error) {
            console.error('Error getting party by ID:', error);
            throw error;
        }
    },

    // Update party
    async update(id, updates) {
        const db = getDatabase();
        const now = Date.now();

        try {
            await db.runAsync(
                `UPDATE parties SET name = ?, description = ?, scheduled_date = ?, scheduled_meal_type = ?, updated_at = ? WHERE id = ?`,
                [
                    updates.name !== undefined ? updates.name : null,
                    updates.description !== undefined ? (updates.description || null) : null,
                    updates.scheduled_date !== undefined ? (updates.scheduled_date || null) : null,
                    updates.scheduled_meal_type !== undefined ? (updates.scheduled_meal_type || null) : null,
                    now,
                    id
                ]
            );
            return true;
        } catch (error) {
            console.error('Error updating party:', error);
            throw error;
        }
    },

    // Delete party
    async delete(id) {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM parties WHERE id = ?', [id]);
            return true;
        } catch (error) {
            console.error('Error deleting party:', error);
            throw error;
        }
    },
};

// Party member operations
export const partyMemberOperations = {
    // Add member to party
    async add(member) {
        const db = getDatabase();
        const now = Date.now();

        try {
            const result = await db.runAsync(
                `INSERT INTO party_members (party_id, user_id, user_name, role, joined_at)
         VALUES (?, ?, ?, ?, ?)`,
                [member.partyId, member.userId, member.userName || null, member.role || 'member', now]
            );
            return result.lastInsertRowId;
        } catch (error) {
            console.error('Error adding party member:', error);
            throw error;
        }
    },

    // Get members for a party
    async getByPartyId(partyId) {
        const db = getDatabase();
        try {
            const members = await db.getAllAsync(
                'SELECT * FROM party_members WHERE party_id = ? ORDER BY joined_at',
                [partyId]
            );
            return members;
        } catch (error) {
            console.error('Error getting party members:', error);
            throw error;
        }
    },

    // Remove member from party
    async remove(partyId, userId) {
        const db = getDatabase();
        try {
            await db.runAsync(
                'DELETE FROM party_members WHERE party_id = ? AND user_id = ?',
                [partyId, userId]
            );
            return true;
        } catch (error) {
            console.error('Error removing party member:', error);
            throw error;
        }
    },
};

// Party meal operations
export const partyMealOperations = {
    // Create a party meal
    async create(meal) {
        const db = getDatabase();
        const now = Date.now();

        try {
            const recipeIdsJson = JSON.stringify(meal.recipeIds || []);
            const result = await db.runAsync(
                `INSERT INTO party_meals (party_id, name, description, recipe_ids, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    meal.partyId,
                    meal.name,
                    meal.description || null,
                    recipeIdsJson,
                    meal.createdBy || null,
                    now,
                    now,
                ]
            );
            return result.lastInsertRowId;
        } catch (error) {
            console.error('Error creating party meal:', error);
            throw error;
        }
    },

    // Get all meals for a party
    async getByPartyId(partyId) {
        const db = getDatabase();
        try {
            const meals = await db.getAllAsync(
                'SELECT * FROM party_meals WHERE party_id = ? ORDER BY created_at DESC',
                [partyId]
            );
            // Parse recipe_ids JSON
            return meals.map(meal => ({
                ...meal,
                recipeIds: meal.recipe_ids ? JSON.parse(meal.recipe_ids) : [],
            }));
        } catch (error) {
            console.error('Error getting party meals:', error);
            throw error;
        }
    },

    // Get meal by ID
    async getById(id) {
        const db = getDatabase();
        try {
            const meal = await db.getFirstAsync(
                'SELECT * FROM party_meals WHERE id = ?',
                [id]
            );
            if (!meal) return null;
            return {
                ...meal,
                recipeIds: meal.recipe_ids ? JSON.parse(meal.recipe_ids) : [],
            };
        } catch (error) {
            console.error('Error getting party meal by ID:', error);
            throw error;
        }
    },

    // Update party meal
    async update(id, updates) {
        const db = getDatabase();
        const now = Date.now();

        try {
            const recipeIdsJson = updates.recipeIds ? JSON.stringify(updates.recipeIds) : null;
            await db.runAsync(
                `UPDATE party_meals SET name = ?, description = ?, recipe_ids = ?, updated_at = ? WHERE id = ?`,
                [
                    updates.name,
                    updates.description || null,
                    recipeIdsJson,
                    now,
                    id,
                ]
            );
            return true;
        } catch (error) {
            console.error('Error updating party meal:', error);
            throw error;
        }
    },

    // Delete party meal
    async delete(id) {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM party_meals WHERE id = ?', [id]);
            return true;
        } catch (error) {
            console.error('Error deleting party meal:', error);
            throw error;
        }
    },
};

// User/Account operations
export const userOperations = {
    // Create or update user
    async upsert(user) {
        const db = getDatabase();
        const now = Date.now();

        try {
            // Check if user exists
            const existing = await db.getFirstAsync(
                'SELECT * FROM users WHERE user_id = ?',
                [user.userId]
            );

            if (existing) {
                // Update
                await db.runAsync(
                    `UPDATE users SET name = ?, username = ?, email = ?, avatar_uri = ?, recipes_cooked = ?, flavor_preferences = ?, updated_at = ? WHERE user_id = ?`,
                    [
                        user.name || null,
                        user.username || null,
                        user.email || null,
                        user.avatarUri || null,
                        user.recipesCooked !== undefined ? user.recipesCooked : existing.recipes_cooked || 0,
                        user.flavorPreferences || null,
                        now,
                        user.userId
                    ]
                );
                return existing.id;
            } else {
                // Insert
                const result = await db.runAsync(
                    `INSERT INTO users (user_id, name, username, email, avatar_uri, recipes_cooked, flavor_preferences, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        user.userId,
                        user.name || null,
                        user.username || null,
                        user.email || null,
                        user.avatarUri || null,
                        user.recipesCooked || 0,
                        user.flavorPreferences || null,
                        now,
                        now
                    ]
                );
                return result.lastInsertRowId;
            }
        } catch (error) {
            console.error('Error upserting user:', error);
            throw error;
        }
    },

    // Get user by ID
    async getByUserId(userId) {
        const db = getDatabase();
        try {
            const user = await db.getFirstAsync(
                'SELECT * FROM users WHERE user_id = ?',
                [userId]
            );
            return user;
        } catch (error) {
            console.error('Error getting user:', error);
            throw error;
        }
    },

    // Get current user (first user or default)
    async getCurrent() {
        const db = getDatabase();
        try {
            const user = await db.getFirstAsync(
                'SELECT * FROM users ORDER BY created_at ASC LIMIT 1'
            );
            return user;
        } catch (error) {
            console.error('Error getting current user:', error);
            throw error;
        }
    },

    // Increment recipes cooked count
    async incrementRecipesCooked(userId) {
        const db = getDatabase();
        try {
            await db.runAsync(
                'UPDATE users SET recipes_cooked = recipes_cooked + 1, updated_at = ? WHERE user_id = ?',
                [Date.now(), userId]
            );
            return true;
        } catch (error) {
            console.error('Error incrementing recipes cooked:', error);
            throw error;
        }
    },

    // Decrement recipes cooked count
    async decrementRecipesCooked(userId) {
        const db = getDatabase();
        try {
            // Get current count first
            const user = await db.getFirstAsync(
                'SELECT recipes_cooked FROM users WHERE user_id = ?',
                [userId]
            );
            if (user) {
                const newCount = Math.max((user.recipes_cooked || 0) - 1, 0);
                await db.runAsync(
                    'UPDATE users SET recipes_cooked = ?, updated_at = ? WHERE user_id = ?',
                    [newCount, Date.now(), userId]
                );
            }
            return true;
        } catch (error) {
            console.error('Error decrementing recipes cooked:', error);
            throw error;
        }
    },
};

// Recipe cooking history operations
export const recipeCookingHistoryOperations = {
    // Mark recipe as cooked
    async markAsCooked(recipeId) {
        const db = getDatabase();
        const now = Date.now();
        try {
            // Ensure recipeId is a number
            const id = typeof recipeId === 'string' ? parseInt(recipeId, 10) : Number(recipeId);
            if (isNaN(id)) {
                throw new Error(`Invalid recipe ID: ${recipeId}`);
            }

            // Check if recipe exists
            const recipe = await db.getFirstAsync('SELECT id, is_cooked FROM recipes WHERE id = ?', [id]);
            if (!recipe) {
                throw new Error(`Recipe with ID ${id} not found`);
            }

            const isCurrentlyCooked = recipe.is_cooked === 1;

            if (isCurrentlyCooked) {
                // Unmark as cooked
                // Update recipe is_cooked status to 0
                await db.runAsync(
                    'UPDATE recipes SET is_cooked = 0, updated_at = ? WHERE id = ?',
                    [now, id]
                );
                return { marked: false, wasCooked: true };
            } else {
                // Mark as cooked
                // Add to cooking history
                try {
                    await db.runAsync(
                        'INSERT INTO recipe_cooking_history (recipe_id, cooked_at) VALUES (?, ?)',
                        [id, now]
                    );
                } catch (historyError) {
                    // If it's a constraint error, that's okay - recipe was already marked
                    if (!historyError.message.includes('UNIQUE') && !historyError.message.includes('constraint')) {
                        console.error('Error adding to cooking history:', historyError);
                        // Continue anyway - we still want to update is_cooked
                    }
                }

                // Update recipe is_cooked status
                await db.runAsync(
                    'UPDATE recipes SET is_cooked = 1, updated_at = ? WHERE id = ?',
                    [now, id]
                );
                return { marked: true, wasCooked: false };
            }
        } catch (error) {
            console.error('Error marking recipe as cooked:', error);
            console.error('Recipe ID:', recipeId, 'Type:', typeof recipeId);
            throw error;
        }
    },

    // Get cooking count for a recipe
    async getCookedCount(recipeId) {
        const db = getDatabase();
        try {
            const result = await db.getFirstAsync(
                'SELECT COUNT(*) as count FROM recipe_cooking_history WHERE recipe_id = ?',
                [recipeId]
            );
            return result?.count || 0;
        } catch (error) {
            console.error('Error getting cooked count:', error);
            throw error;
        }
    },

    // Get total recipes cooked by user
    async getTotalCookedCount() {
        const db = getDatabase();
        try {
            const result = await db.getFirstAsync(
                'SELECT COUNT(DISTINCT recipe_id) as count FROM recipe_cooking_history'
            );
            return result?.count || 0;
        } catch (error) {
            console.error('Error getting total cooked count:', error);
            throw error;
        }
    },
};

// Party statistics operations
export const partyStatsOperations = {
    // Get total members who joined user's parties
    async getTotalMembersJoined(userId) {
        const db = getDatabase();
        try {
            const result = await db.getFirstAsync(
                `SELECT COUNT(DISTINCT pm.id) as count 
                 FROM party_members pm
                 JOIN parties p ON pm.party_id = p.id
                 WHERE p.created_by = ? AND pm.user_id != ?`,
                [userId, userId]
            );
            return result?.count || 0;
        } catch (error) {
            console.error('Error getting total members joined:', error);
            throw error;
        }
    },
};

// Party meal ingredient claim operations
export const partyMealIngredientClaimOperations = {
    // Claim an ingredient for a party meal
    async claimIngredient(claim) {
        const db = getDatabase();
        const now = Date.now();
        try {
            const result = await db.runAsync(
                `INSERT INTO party_meal_ingredient_claims (party_meal_id, recipe_id, ingredient_name, claimed_by_user_id, claimed_by_user_name, pantry_item_id, claimed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    claim.partyMealId,
                    claim.recipeId,
                    claim.ingredientName,
                    claim.claimedByUserId,
                    claim.claimedByUserName || null,
                    claim.pantryItemId || null,
                    now
                ]
            );
            return result.lastInsertRowId;
        } catch (error) {
            console.error('Error claiming ingredient:', error);
            throw error;
        }
    },

    // Get claims for a party meal
    async getClaimsByPartyMeal(partyMealId) {
        const db = getDatabase();
        try {
            const claims = await db.getAllAsync(
                'SELECT * FROM party_meal_ingredient_claims WHERE party_meal_id = ? ORDER BY claimed_at',
                [partyMealId]
            );
            return claims;
        } catch (error) {
            console.error('Error getting ingredient claims:', error);
            throw error;
        }
    },

    // Remove a claim
    async removeClaim(claimId) {
        const db = getDatabase();
        try {
            await db.runAsync('DELETE FROM party_meal_ingredient_claims WHERE id = ?', [claimId]);
            return true;
        } catch (error) {
            console.error('Error removing claim:', error);
            throw error;
        }
    },
};
