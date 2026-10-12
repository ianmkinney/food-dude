import { ampiChatResponseFormat } from './ampiResponseSchema.js';

/** Canonical Ampi tool names (single source for adapter + tests). */
export const AMPI_TOOL_NAMES = [
    'find_recipes',
    'import_recipe',
    'create_recipe',
    'update_recipe',
    'add_to_meal_plan',
    'add_to_pantry',
    'add_to_grocery',
    'update_grocery_list',
    'estimate_cost',
    'remember_fact',
];

const itemSchema = {
    type: 'object',
    additionalProperties: true,
    properties: {
        name: { type: 'string' },
        quantity: {},
        unit: {},
        category: {},
    },
};

const ingredientSchema = {
    type: 'object',
    additionalProperties: true,
    properties: {
        ingredient: { type: 'string' },
        quantity: {},
        unit: {},
    },
};

/** OpenAI / OpenRouter `tools` payload (function definitions). */
export const AMPI_OPENAI_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'find_recipes',
            description: 'Search saved recipes by query.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: { query: { type: 'string' } },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'import_recipe',
            description: 'Import a recipe from URL or pasted text.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: { url: { type: 'string' }, text: { type: 'string' } },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_recipe',
            description: 'Save a new recipe to the recipe book.',
            parameters: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    servings: { type: 'number' },
                    prep_time: { type: 'number' },
                    cook_time: { type: 'number' },
                    calories: { type: 'number' },
                    protein: { type: 'number' },
                    carbohydrates: { type: 'number' },
                    fat: { type: 'number' },
                    fiber: { type: 'number' },
                    sugar: { type: 'number' },
                    sodium: { type: 'number' },
                    ingredients: { type: 'array', items: ingredientSchema },
                    instructions: { type: 'array', items: { type: 'string' } },
                },
                required: ['title', 'ingredients', 'instructions'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'update_recipe',
            description:
                'Edit an existing saved recipe. Set recipe_id to the numeric id (e.g. 10 or "#10"). Send only fields that change.',
            parameters: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    recipe_id: {},
                    recipe_title: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    servings: { type: 'number' },
                    prep_time: { type: 'number' },
                    cook_time: { type: 'number' },
                    calories: { type: 'number' },
                    protein: { type: 'number' },
                    carbohydrates: { type: 'number' },
                    fat: { type: 'number' },
                    fiber: { type: 'number' },
                    sugar: { type: 'number' },
                    sodium: { type: 'number' },
                    ingredients: { type: 'array', items: ingredientSchema },
                    instructions: { type: 'array', items: { type: 'string' } },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_to_meal_plan',
            description: 'Schedule a saved recipe on the meal planner.',
            parameters: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    recipe_id: { type: 'number' },
                    recipe_title: { type: 'string' },
                    date: { type: 'string' },
                    meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
                },
                required: ['date', 'meal_type'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_to_pantry',
            description: 'Record items the user has at home.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: { items: { type: 'array', items: itemSchema } },
                required: ['items'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_to_grocery',
            description: 'Add items to the grocery list.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: { items: { type: 'array', items: itemSchema } },
                required: ['items'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'update_grocery_list',
            description: 'Remove or check off grocery list items.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    remove: { type: 'array', items: { type: 'string' } },
                    add_to_pantry: { type: 'boolean' },
                },
                required: ['remove'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'estimate_cost',
            description: 'Estimate grocery list cost.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: { store: { type: 'string' } },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'remember_fact',
            description: 'Save a durable user preference fact.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    fact: { type: 'string' },
                    category: {
                        type: 'string',
                        enum: ['likes', 'dislikes', 'household', 'equipment', 'skill', 'goals'],
                    },
                },
                required: ['fact', 'category'],
            },
        },
    },
];

export const AMPI_JSON_TURN_INSTRUCTION = `Respond with a single JSON object only (no markdown fences), shape:
{"reply": string, "actions": [{"tool": string, "args": object}]}
Use tool names exactly: ${AMPI_TOOL_NAMES.join(', ')}.
For update_recipe always include recipe_id as a number when you know it (from the recipe list, e.g. 10 not "?").
Put user-facing text in reply; put app mutations in actions.`;

export function ampiStructuredResponseFormat() {
    return ampiChatResponseFormat();
}
