// In-memory stand-ins for the database, AI client and device modules that
// src/sous/agent.ts pulls in. Tests drive them through `ampiTest`.

export const ampiTest = {
    recipes: new Map(),
    chatRows: [],
    nextRecipeId: 1,
    nextRowId: 1,
    prompts: [],
    /** Set per turn: (prompt) => raw model text. */
    model: null,
    /** What parseRecipeFromUrl returns for the next import. */
    importResult: null,
    reset() {
        this.recipes.clear();
        this.chatRows = [];
        this.nextRecipeId = 1;
        this.nextRowId = 1;
        this.prompts = [];
        this.model = null;
        this.importResult = null;
    },
};

const storage = new Map();
export default {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => void storage.set(key, String(value)),
    removeItem: async (key) => void storage.delete(key),
};

export const Platform = { OS: 'web' };

const clone = (value) => JSON.parse(JSON.stringify(value));

export const recipeOperations = {
    async create(recipe) {
        const id = ampiTest.nextRecipeId++;
        ampiTest.recipes.set(id, {
            id,
            title: recipe.title,
            description: recipe.description ?? null,
            image_uri: recipe.imageUri ?? null,
            prep_time: recipe.prepTime ?? null,
            cook_time: recipe.cookTime ?? null,
            is_ai_generated: 0,
            ingredients: (recipe.ingredients || []).map((ing) => ({ ...ing })),
            instructions: [...(recipe.instructions || [])],
        });
        return id;
    },
    async getById(id) {
        const recipe = ampiTest.recipes.get(Number(id));
        return recipe ? clone(recipe) : null;
    },
    async getAll() {
        return [...ampiTest.recipes.values()].map(clone);
    },
    async search(query) {
        const q = String(query).toLowerCase();
        return [...ampiTest.recipes.values()].filter((r) => r.title.toLowerCase().includes(q)).map(clone);
    },
    async update(id, updates) {
        const recipe = ampiTest.recipes.get(Number(id));
        if (!recipe) throw new Error('Recipe not found');
        if (updates.title !== undefined) recipe.title = updates.title;
        if (updates.description !== undefined) recipe.description = updates.description;
        if (updates.prepTime !== undefined) recipe.prep_time = updates.prepTime;
        if (updates.cookTime !== undefined) recipe.cook_time = updates.cookTime;
        if (Array.isArray(updates.ingredients)) recipe.ingredients = updates.ingredients.map((ing) => ({ ...ing }));
        if (Array.isArray(updates.instructions)) recipe.instructions = [...updates.instructions];
        return true;
    },
    async setProvenance(id, { isAiGenerated } = {}) {
        const recipe = ampiTest.recipes.get(Number(id));
        if (recipe && isAiGenerated !== undefined) recipe.is_ai_generated = isAiGenerated ? 1 : 0;
    },
};

export const chatOperations = {
    async addMessage(threadId, { role, text, meta = null }) {
        const id = ampiTest.nextRowId++;
        ampiTest.chatRows.push({
            id,
            thread_id: threadId,
            role,
            text,
            meta_json: meta ? JSON.stringify(meta) : null,
            created_at: id,
        });
        return id;
    },
    async getRecent(threadId, limit = 40) {
        return ampiTest.chatRows.filter((r) => r.thread_id === threadId).slice(-limit).map(clone);
    },
    async getSummary() {
        return '';
    },
    async setSummary() {},
};

export const pantryOperations = { getAll: async () => [], add: async () => undefined };
export const groceryOperations = { getAll: async () => [], add: async () => undefined };
export const mealPlanOperations = { add: async () => undefined };
export const userOperations = { getCurrent: async () => null };
export const memoryOperations = { list: async () => [], upsert: async () => undefined };

export const stripCodeFences = (text) => text.replace(/^```(?:json)?\s*|\s*```$/g, '');
export async function generateText(prompt) {
    ampiTest.prompts.push(prompt);
    if (!ampiTest.model) throw new Error('No scripted model reply for this turn');
    return ampiTest.model(prompt);
}
export const generateMultimodal = ({ prompt }) => generateText(prompt);

export const getIncludeHealthData = async () => false;
export const prepareAttachmentPayload = async () => ({ promptExtra: '', images: [], attachments: [] });

export async function parseRecipeFromUrl(url) {
    if (!ampiTest.importResult) throw new Error(`No scripted import for ${url}`);
    return ampiTest.importResult;
}
export const parseRecipe = parseRecipeFromUrl;
export const estimateGroceryCost = async () => ({ success: false, error: 'not in tests' });
export const toPersistentImageUri = async (uri) => uri;
