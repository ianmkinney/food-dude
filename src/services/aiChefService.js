import * as FileSystem from 'expo-file-system/legacy';
import { groceryOperations, pantryOperations, recipeOperations } from '../database/operations';
import { generateImage, generateMultimodal, generateText } from './aiClient';
import { requireAiConfigured } from './aiSettings';

/**
 * Multi-modal AI Chef service
 * Supports text, image, and video inputs for cooking assistance
 */
export class AiChefService {
    constructor() {
        this.conversationHistory = [];
    }

    /**
     * Helper to retry operations with exponential backoff
     */
    async retryOperation(operation, maxRetries = 3, delay = 1000) {
        console.log(`[AI Chef Service] retryOperation called with maxRetries=${maxRetries}, delay=${delay}`);
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                console.log(`[AI Chef Service] Retry attempt ${i + 1}/${maxRetries}`);
                const result = await operation();
                console.log(`[AI Chef Service] Operation succeeded on attempt ${i + 1}`);
                return result;
            } catch (error) {
                lastError = error;
                console.error(`[AI Chef Service] Attempt ${i + 1} failed:`, error.message);
                console.error(`[AI Chef Service] Error details:`, {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                });
                
                // Check for 503 (Service Unavailable) or 429 (Too Many Requests)
                if (error.message.includes('503') || error.message.includes('429') || error.code === 503 || error.code === 429) {
                    console.log(`[AI Chef Service] Retryable error detected. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                } else {
                    console.error(`[AI Chef Service] Non-retryable error, throwing immediately`);
                    throw error; // Don't retry other errors
                }
            }
        }
        console.error(`[AI Chef Service] All retry attempts failed`);
        throw lastError;
    }

    /**
     * Generate recipe from pantry items
     */
    async generateRecipeFromPantry(pantryItems) {
        console.log('[AI Chef Service] generateRecipeFromPantry called');
        console.log('[AI Chef Service] Pantry items count:', pantryItems.length);
        
        await requireAiConfigured();

        try {
            const itemsList = pantryItems.map(item => `- ${item.name}${item.quantity ? ` (${item.quantity} ${item.unit || ''})` : ''}`).join('\n');
            console.log('[AI Chef Service] Items list length:', itemsList.length);

            // Get user flavor preferences if available
            let flavorContext = '';
            try {
                const { userOperations } = await import('../database/operations');
                const currentUser = await userOperations.getCurrent();
                if (currentUser?.flavor_preferences) {
                    flavorContext = `\n\nIMPORTANT: The user's flavor preferences are: ${currentUser.flavor_preferences}. Please create a recipe that aligns with these preferences.`;
                }
            } catch (error) {
                console.log('[AI Chef Service] Could not load user preferences:', error);
            }

            const prompt = `You are a creative chef. Create a delicious recipe using ONLY the following ingredients from the user's pantry:

${itemsList}

Return ONLY a valid JSON object with this structure (no markdown, no code blocks):

{
  "title": "Creative recipe name",
  "description": "Why this recipe is great",
  "servings": number,
  "prepTime": minutes,
  "cookTime": minutes,
  "totalTime": minutes,
  "difficulty": "easy" | "medium" | "hard",
  "ingredients": [
    {
      "ingredient": "ingredient name from pantry",
      "quantity": "amount needed",
      "unit": "unit"
    }
  ],
  "instructions": ["step 1", "step 2", ...],
  "tags": ["tag1", "tag2", ...],
  "chefNote": "A personal note about the recipe or tips",
  "calories": number (per serving, or null if cannot estimate),
  "protein": number (grams per serving, or null if cannot estimate),
  "carbohydrates": number (grams per serving, or null if cannot estimate),
  "fat": number (grams per serving, or null if cannot estimate),
  "fiber": number (grams per serving, or null if cannot estimate),
  "sugar": number (grams per serving, or null if cannot estimate),
  "sodium": number (milligrams per serving, or null if cannot estimate)
}

Be creative but realistic. Only use ingredients from the pantry list above.

For nutritional info:
- Calculate realistic estimates based on the ingredient quantities and cooking methods you specify.
- Use standard nutritional databases for common ingredients.
- All values should be per serving, not for the entire recipe.
- If you cannot make a reasonable estimate, use null for that field.${flavorContext}`;

            console.log('[AI Chef Service] Prompt length:', prompt.length);
            const startTime = Date.now();
            const text = await this.retryOperation(async () => generateText(prompt));
            console.log(`[AI Chef Service] generateText completed in ${Date.now() - startTime}ms`);
            console.log('[AI Chef Service] Text extracted, length:', text?.length || 0);

            // Clean up response
            let cleanedText = text.trim();
            console.log('[AI Chef Service] Cleaning text...');
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
                console.log('[AI Chef Service] Removed ```json markers');
            } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/```\n?/g, '');
                console.log('[AI Chef Service] Removed ``` markers');
            }

            console.log('[AI Chef Service] Parsing JSON...');
            console.log('[AI Chef Service] Cleaned text preview:', cleanedText.substring(0, 300));
            const recipe = JSON.parse(cleanedText);
            console.log('[AI Chef Service] JSON parsed successfully');
            console.log('[AI Chef Service] Recipe title:', recipe.title);

            return {
                success: true,
                recipe,
            };
        } catch (error) {
            console.error('[AI Chef Service] Error in generateRecipeFromPantry:', error);
            console.error('[AI Chef Service] Error name:', error.name);
            console.error('[AI Chef Service] Error message:', error.message);
            console.error('[AI Chef Service] Error stack:', error.stack);
            
            if (error.response) {
                console.error('[AI Chef Service] Error response:', JSON.stringify(error.response, null, 2));
            }
            
            return {
                success: false,
                error: error.message || 'Unknown error occurred',
            };
        }
    }

    /**
     * Tool functions for AI Chef
     */
    async getGroceryItems() {
        try {
            const items = await groceryOperations.getAll();
            return {
                success: true,
                items: items.map(item => ({
                    id: item.id,
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    category: item.category,
                    isChecked: item.is_checked,
                    recipeName: item.recipe_name,
                })),
            };
        } catch (error) {
            console.error('[AI Chef Service] Error getting grocery items:', error);
            // Return empty list instead of failing - this prevents the error from breaking the AI response
            return {
                success: true,
                items: [],
                error: error.message,
            };
        }
    }

    async addGroceryItem(item) {
        try {
            const id = await groceryOperations.add({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                category: item.category,
                notes: item.notes,
            });
            return {
                success: true,
                id,
                message: `Added ${item.name} to grocery list`,
            };
        } catch (error) {
            console.error('[AI Chef Service] Error adding grocery item:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    async getPantryItems() {
        try {
            const items = await pantryOperations.getAll();
            return {
                success: true,
                items: items.map(item => ({
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    quantity: item.quantity,
                    unit: item.unit,
                    expirationDate: item.expiration_date,
                    location: item.location,
                })),
            };
        } catch (error) {
            console.error('[AI Chef Service] Error getting pantry items:', error);
            // Return empty list instead of failing
            return {
                success: true,
                items: [],
                error: error.message,
            };
        }
    }

    async addPantryItem(item) {
        try {
            const id = await pantryOperations.add({
                name: item.name,
                category: item.category,
                quantity: item.quantity,
                unit: item.unit,
                expirationDate: item.expirationDate,
                location: item.location,
                notes: item.notes,
            });
            return {
                success: true,
                id,
                message: `Added ${item.name} to pantry`,
            };
        } catch (error) {
            console.error('[AI Chef Service] Error adding pantry item:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    async getRecipes(searchQuery = null) {
        try {
            let recipes;
            if (searchQuery) {
                recipes = await recipeOperations.search(searchQuery);
            } else {
                recipes = await recipeOperations.getAll();
            }
            return {
                success: true,
                recipes: recipes.map(recipe => ({
                    id: recipe.id,
                    title: recipe.title,
                    description: recipe.description,
                    servings: recipe.servings,
                    prepTime: recipe.prep_time,
                    cookTime: recipe.cook_time,
                    totalTime: recipe.total_time,
                    difficulty: recipe.difficulty,
                    cuisine: recipe.cuisine,
                    imageUri: recipe.image_uri,
                })),
            };
        } catch (error) {
            console.error('[AI Chef Service] Error getting recipes:', error);
            // Return empty list instead of failing
            return {
                success: true,
                recipes: [],
                error: error.message,
            };
        }
    }

    async getRecipeById(recipeId) {
        try {
            const recipe = await recipeOperations.getById(recipeId);
            if (!recipe) {
                return {
                    success: false,
                    error: 'Recipe not found',
                };
            }
            return {
                success: true,
                recipe: {
                    id: recipe.id,
                    title: recipe.title,
                    description: recipe.description,
                    servings: recipe.servings,
                    prepTime: recipe.prep_time,
                    cookTime: recipe.cook_time,
                    totalTime: recipe.total_time,
                    difficulty: recipe.difficulty,
                    cuisine: recipe.cuisine,
                    imageUri: recipe.image_uri,
                    ingredients: recipe.ingredients,
                    instructions: recipe.instructions,
                    tags: recipe.tags,
                },
            };
        } catch (error) {
            console.error('[AI Chef Service] Error getting recipe:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Send text message to AI chef with tool support
     */
    async sendMessage(message, context = {}) {
        console.log('[AI Chef Service] sendMessage called');
        console.log('[AI Chef Service] Message:', message);
        console.log('[AI Chef Service] Context:', JSON.stringify(context, null, 2));

        await requireAiConfigured();

        try {
            // Detect intent and fetch relevant data
            const lowerMessage = message.toLowerCase();
            let groceryContext = '';
            let pantryContext = '';
            let recipesContext = '';

            // Check if user is asking about grocery list
            if (lowerMessage.includes('grocery') || lowerMessage.includes('shopping list') || lowerMessage.includes('what do i need to buy')) {
                try {
                    const groceryResult = await this.getGroceryItems();
                    if (groceryResult.success) {
                        if (groceryResult.items.length > 0) {
                            const uncheckedItems = groceryResult.items.filter(item => !item.isChecked);
                            if (uncheckedItems.length > 0) {
                                groceryContext = `\n\nUser's current grocery list (items to buy):\n${uncheckedItems.map(item => `- ${item.name}${item.quantity ? ` (${item.quantity} ${item.unit || ''})` : ''}`).join('\n')}`;
                            } else {
                                groceryContext = `\n\nUser's grocery list is empty or all items are checked.`;
                            }
                        } else {
                            groceryContext = `\n\nUser's grocery list is currently empty.`;
                        }
                    }
                } catch (error) {
                    console.error('[AI Chef Service] Error loading grocery items for context:', error);
                    // Don't add context if there's an error - just continue without it
                }
            }

            // Check if user is asking about pantry
            if (lowerMessage.includes('pantry') || lowerMessage.includes('what do i have') || lowerMessage.includes('available ingredients') || lowerMessage.includes('what\'s in my pantry')) {
                try {
                    const pantryResult = await this.getPantryItems();
                    if (pantryResult.success && pantryResult.items.length > 0) {
                        pantryContext = `\n\nUser's current pantry items:\n${pantryResult.items.map(item => `- ${item.name}${item.quantity ? ` (${item.quantity} ${item.unit || ''})` : ''}`).join('\n')}`;
                    } else {
                        pantryContext = `\n\nUser's pantry is currently empty.`;
                    }
                } catch (error) {
                    console.error('[AI Chef Service] Error loading pantry items for context:', error);
                }
            }

            // Check if user is asking about recipes
            if (lowerMessage.includes('recipe') || lowerMessage.includes('my recipes') || lowerMessage.includes('recipe book')) {
                try {
                    // Try to extract search query
                    let searchQuery = null;
                    const recipeMatch = lowerMessage.match(/(?:recipe|recipes).*?(?:called|named|with|for)\s+([^?.,!]+)/i);
                    if (recipeMatch) {
                        searchQuery = recipeMatch[1].trim();
                    }
                    const recipesResult = await this.getRecipes(searchQuery);
                    if (recipesResult.success && recipesResult.recipes.length > 0) {
                        recipesContext = `\n\nUser's saved recipes:\n${recipesResult.recipes.slice(0, 10).map(recipe => `- ${recipe.title}${recipe.description ? `: ${recipe.description.substring(0, 50)}` : ''}`).join('\n')}${recipesResult.recipes.length > 10 ? `\n... and ${recipesResult.recipes.length - 10} more recipes` : ''}`;
                    } else {
                        recipesContext = `\n\nUser has no saved recipes yet.`;
                    }
                } catch (error) {
                    console.error('[AI Chef Service] Error loading recipes for context:', error);
                }
            }

            // Build context-aware prompt
            let systemPrompt = `You are an expert chef and cooking assistant. You help users with:
- Recipe suggestions and modifications
- Cooking techniques and tips
- Ingredient substitutions
- Meal planning advice
- Food safety and storage
- Cooking troubleshooting

You can access the user's grocery list, pantry items, and recipe book. When the user asks about these, use the information provided below to give accurate, helpful responses.

You can also help users:
- Add items to their grocery list (tell them you'll add it, then they can confirm)
- Add items to their pantry (tell them you'll add it, then they can confirm)
- Search and reference their saved recipes

Be friendly, concise, and practical. 

IMPORTANT: When the user asks you to create a recipe, provide a complete recipe in JSON format with this structure:
{
  "title": "Recipe name",
  "description": "Brief description",
  "servings": number,
  "prepTime": number (minutes),
  "cookTime": number (minutes),
  "totalTime": number (minutes),
  "difficulty": "easy" | "medium" | "hard",
  "cuisine": "cuisine type",
  "ingredients": [
    {"ingredient": "name", "quantity": "amount", "unit": "unit"}
  ],
  "instructions": ["step 1", "step 2", ...],
  "tags": ["tag1", "tag2"],
  "chefNote": "helpful tip or note"
}

For regular questions, respond naturally in text format.${groceryContext}${pantryContext}${recipesContext}`;

            if (context.pantryItems) {
                systemPrompt += `\n\nUser's pantry items: ${context.pantryItems.map(i => i.name).join(', ')}`;
            }

            if (context.currentRecipe) {
                systemPrompt += `\n\nUser is currently viewing recipe: ${context.currentRecipe.title}`;
            }

            if (context.flavorPreferences) {
                systemPrompt += `\n\nUser's flavor preferences: ${context.flavorPreferences}. When suggesting recipes or modifications, prioritize these preferences.`;
            }

            const fullPrompt = `${systemPrompt}\n\nUser: ${message}`;
            console.log('[AI Chef Service] Full prompt length:', fullPrompt.length);
            const startTime = Date.now();
            const text = await this.retryOperation(async () => generateText(fullPrompt));
            console.log(`[AI Chef Service] generateText completed in ${Date.now() - startTime}ms`);
            console.log('[AI Chef Service] Text extracted, length:', text?.length || 0);

            // Add to conversation history
            this.conversationHistory.push(
                { role: 'user', message },
                { role: 'assistant', message: text }
            );

            console.log('[AI Chef Service] Returning success response');
            return {
                success: true,
                message: text,
            };
        } catch (error) {
            console.error('[AI Chef Service] Error in sendMessage:', error);
            console.error('[AI Chef Service] Error name:', error.name);
            console.error('[AI Chef Service] Error message:', error.message);
            console.error('[AI Chef Service] Error stack:', error.stack);
            
            if (error.response) {
                console.error('[AI Chef Service] Error response:', JSON.stringify(error.response, null, 2));
            }
            
            return {
                success: false,
                error: error.message || 'Unknown error occurred',
            };
        }
    }

    /**
     * Analyze image (ingredient, dish, cooking technique)
     */
    async analyzeImage(imageUri, question = null) {
        await requireAiConfigured();

        try {
            const base64 = await FileSystem.readAsStringAsync(imageUri, {
                encoding: 'base64',
            });

            const prompt = question ||
                'Analyze this food/ingredient image. Identify what it is, suggest recipes, or provide cooking tips.';

            const text = await this.retryOperation(async () =>
                generateMultimodal({
                    prompt,
                    images: [{ data: base64, mimeType: 'image/jpeg' }],
                })
            );

            return {
                success: true,
                message: text,
            };
        } catch (error) {
            console.error('Error analyzing image:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Analyze video (cooking technique, recipe demonstration)
     */
    async analyzeVideo(videoUri, question = null) {
        await requireAiConfigured();

        try {
            const base64 = await FileSystem.readAsStringAsync(videoUri, {
                encoding: 'base64',
            });

            const prompt = question ||
                'Analyze this cooking video. Describe the technique, identify the dish, or provide tips and suggestions.';

            const text = await this.retryOperation(async () =>
                generateMultimodal({
                    prompt,
                    video: { data: base64, mimeType: 'video/mp4' },
                })
            );

            return {
                success: true,
                message: text,
            };
        } catch (error) {
            console.error('Error analyzing video:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Get detailed cooking instructions for a recipe
     */
    async getDetailedInstructions(recipe) {
        await requireAiConfigured();

        try {
            const prompt = `Provide detailed, step-by-step cooking instructions for this recipe.
            
Recipe: ${recipe.title}
Ingredients: ${recipe.ingredients.map(i => `${i.quantity} ${i.unit} ${i.ingredient}`).join(', ')}

Return ONLY a valid JSON array of strings, where each string is a step.
Example: ["Chop the onions.", "Sauté garlic."]

Instructions:`;

            const text = await this.retryOperation(async () => generateText(prompt));

            // Clean up response
            let cleanedText = text.trim();
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/```\n?/g, '');
            }

            const instructions = JSON.parse(cleanedText);

            return {
                success: true,
                instructions,
            };
        } catch (error) {
            console.error('Error getting detailed instructions:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Estimate grocery costs using AI
     */
    async estimateGroceryCost(groceryItems, storeName = null, location = null) {
        await requireAiConfigured();

        try {
            // Build grocery list string
            const itemsList = groceryItems.map(item =>
                `- ${item.name}${item.quantity ? ` (${item.quantity} ${item.unit || ''})` : ''}`
            ).join('\n');

            // Build context string
            let context = '';
            if (storeName) {
                context += `Store: ${storeName}\n`;
            }
            if (location) {
                context += `Location: ${location}\n`;
            }

            const prompt = `You are a grocery pricing expert. Estimate the cost for each item in this grocery list.
${context ? `\nContext:\n${context}` : ''}

Grocery List:
${itemsList}

Provide realistic price estimates based on ${storeName && location ? 'the specific store and location' : storeName ? 'the store type' : location ? 'the location' : 'average US prices'}.

Return ONLY a valid JSON object with this structure (no markdown, no code blocks):

{
  "items": [
    {
      "name": "item name",
      "quantity": "quantity with unit",
      "estimatedPrice": number,
      "priceNote": "brief explanation of the estimate"
    }
  ],
  "total": number,
  "disclaimer": "A note about estimation accuracy"
}`;

            const text = await this.retryOperation(async () => generateText(prompt));

            // Clean up response
            let cleanedText = text.trim();
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/```\n?/g, '');
            }

            const estimate = JSON.parse(cleanedText);

            return {
                success: true,
                estimate,
            };
        } catch (error) {
            console.error('Error estimating grocery cost:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Enhance recipe with AI - fill missing data and verify existing data
     */
    async enhanceRecipe(recipe, customInstructions = null) {
        await requireAiConfigured();

        try {
            // Build current recipe info
            const recipeInfo = `
Title: ${recipe.title}
Description: ${recipe.description || 'Not provided'}
Servings: ${recipe.servings || 'Not specified'}
Prep Time: ${recipe.prep_time || 'Not specified'} minutes
Cook Time: ${recipe.cook_time || 'Not specified'} minutes
Total Time: ${recipe.total_time || 'Not specified'} minutes
Difficulty: ${recipe.difficulty || 'Not specified'}
Cuisine: ${recipe.cuisine || 'Not specified'}

Current Nutritional Info (per serving):
Calories: ${recipe.calories || 'Not provided'}
Protein: ${recipe.protein || 'Not provided'} g
Carbohydrates: ${recipe.carbohydrates || 'Not provided'} g
Fat: ${recipe.fat || 'Not provided'} g
Fiber: ${recipe.fiber || 'Not provided'} g
Sugar: ${recipe.sugar || 'Not provided'} g
Sodium: ${recipe.sodium || 'Not provided'} mg

Ingredients:
${recipe.ingredients.map(ing => `- ${ing.quantity || ''} ${ing.unit || ''} ${ing.ingredient}`).join('\n')}

Instructions:
${recipe.instructions && recipe.instructions.length > 0 ? recipe.instructions.map((step, i) => `${i + 1}. ${step}`).join('\n') : 'None provided'}
`;

            let instructionsText = `You are a professional chef and recipe expert. Analyze this recipe and:
1. Fill in any missing information (servings, prep time, cook time, total time, difficulty, cuisine)
2. Verify that existing data makes sense given the ingredients and instructions
3. Correct any obviously incorrect values
4. Calculate nutritional information (per serving) based on ingredients and cooking methods. If nutritional info is missing, provide close approximations based on:
   - The types and quantities of ingredients
   - Cooking methods (e.g., frying adds fat, boiling may reduce some nutrients)
   - Standard nutritional databases for common ingredients
   - Realistic estimates for homemade recipes`;

            if (customInstructions && customInstructions.trim()) {
                instructionsText += `\n\n5. IMPORTANT: The user has requested specific modifications: "${customInstructions.trim()}"
   - Apply these modifications to the recipe while maintaining its core identity
   - Adjust ingredients, instructions, and nutritional info accordingly
   - Explain in the "reason" field how you applied the user's custom instructions`;
            }

            const prompt = `${instructionsText}

Current Recipe:
${recipeInfo}

Return ONLY a valid JSON object with this structure (no markdown, no code blocks):

{
  "updatedRecipe": {
    "servings": number,
    "prep_time": number (in minutes),
    "cook_time": number (in minutes),
    "total_time": number (in minutes),
    "difficulty": "easy" | "medium" | "hard",
    "cuisine": "cuisine type",
    "description": "improved description if original was missing or poor",
    "ingredients": [
      {
        "ingredient": "ingredient name",
        "quantity": "amount",
        "unit": "unit of measurement",
        "section": "section name" or null
      }
    ],
    "instructions": ["step 1", "step 2", ...],
    "calories": number (per serving, or null if cannot estimate),
    "protein": number (grams per serving, or null if cannot estimate),
    "carbohydrates": number (grams per serving, or null if cannot estimate),
    "fat": number (grams per serving, or null if cannot estimate),
    "fiber": number (grams per serving, or null if cannot estimate),
    "sugar": number (grams per serving, or null if cannot estimate),
    "sodium": number (milligrams per serving, or null if cannot estimate)
  },
  "changes": [
    {
      "field": "field name",
      "oldValue": "old value or null if missing",
      "newValue": "new value",
      "reason": "explanation for the change"
    }
  ]
}

Important:
- Always include the complete "ingredients" and "instructions" arrays in "updatedRecipe", even if unchanged
- If custom instructions were provided, update ingredients and/or instructions accordingly
- Only include fields that changed or were filled in the "changes" array (but always include ingredients and instructions in updatedRecipe)
- Be conservative - don't change values that seem reasonable unless custom instructions require it
- All time values should be realistic based on the ingredients and complexity
- Total time should equal prep time + cook time
- For nutritional info: Provide realistic estimates based on ingredient quantities and cooking methods. If you cannot make a reasonable estimate, use null for that field.
- Nutritional values should be per serving, not for the entire recipe
- Ingredients should maintain the same structure: ingredient name, quantity, unit, and optional section`;

            const text = await this.retryOperation(async () => generateText(prompt));

            // Clean up response
            let cleanedText = text.trim();
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/```\n?/g, '');
            }

            const enhancement = JSON.parse(cleanedText);

            return {
                success: true,
                enhancement,
            };
        } catch (error) {
            console.error('Error enhancing recipe:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Generate recipe image using AI
     */
    async generateRecipeImage(recipe) {
        await requireAiConfigured();

        try {
            const prompt = `Generate a professional, appetizing food photography image of this dish:

Title: ${recipe.title}
Description: ${recipe.description || 'A delicious recipe'}
Cuisine: ${recipe.cuisine || 'General'}
Difficulty: ${recipe.difficulty || 'Medium'}

Key Ingredients: ${recipe.ingredients ? recipe.ingredients.slice(0, 5).map(ing => ing.ingredient).join(', ') : 'various ingredients'}

Requirements:
- Professional food photography style
- High quality, well-lit, appetizing presentation
- Realistic plating and garnish
- Restaurant-quality presentation
- Focus on the finished dish
- Warm, inviting atmosphere

Create a beautiful, mouth-watering photo that makes viewers want to cook and eat this dish.`;

            const result = await this.retryOperation(async () => generateImage(prompt));

            return {
                success: true,
                imageUri: result.imageUri,
                response: result.response,
            };
        } catch (error) {
            console.error('Error generating recipe image:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Intelligently match recipe ingredients with pantry items using AI
     */
    async matchIngredientsWithPantry(ingredientList, pantryList) {
        await requireAiConfigured();

        try {
            const prompt = `You are a smart ingredient matcher. I need you to match recipe ingredients with items in a pantry.

Recipe ingredients needed: ${ingredientList}

Pantry items available: ${pantryList}

For each recipe ingredient, determine if there is a matching item in the pantry. Be intelligent about matching:
- Consider synonyms (e.g., "tomatoes" matches "tomato", "fresh tomatoes")
- Consider variations (e.g., "flour" matches "all-purpose flour", "wheat flour")
- Consider forms (e.g., "butter" matches "unsalted butter", "salted butter")
- Consider generic vs specific (e.g., "cheese" matches "cheddar cheese", "mozzarella")
- Be flexible but accurate

Return ONLY a valid JSON object with this structure (no markdown, no code blocks):

{
  "matches": [
    {
      "ingredient": "exact ingredient name from recipe",
      "hasMatch": true or false,
      "matchedPantryItem": "matched pantry item name or null",
      "confidence": "high" | "medium" | "low"
    }
  ]
}`;

            const text = await this.retryOperation(async () => generateText(prompt));

            // Clean up response
            let cleanedText = text.trim();
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/```\n?/g, '');
            }

            const matchResult = JSON.parse(cleanedText);

            return {
                success: true,
                matches: matchResult.matches || [],
            };
        } catch (error) {
            console.error('Error matching ingredients with AI:', error);
            return {
                success: false,
                error: error.message,
                matches: [],
            };
        }
    }

    /**
     * Clear conversation history
     */
    clearHistory() {
        this.conversationHistory = [];
    }

    /**
     * Get conversation history
     */
    getHistory() {
        return this.conversationHistory;
    }
}

// Export singleton instance
export default new AiChefService();
