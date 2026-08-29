import { groceryOperations } from '../database/operations';
import { generateText, stripCodeFences } from './aiClient';
import { requireAiConfigured } from './aiSettings';

/**
 * Generate grocery list from meal plan
 */
export const generateGroceryListFromMealPlan = async (mealPlans, recipes) => {
    try {
        // Collect all ingredients from recipes in meal plan
        const ingredientsMap = new Map();

        for (const meal of mealPlans) {
            const recipe = recipes.find(r => r.id === meal.recipe_id);
            if (!recipe || !recipe.ingredients) continue;

            for (const ingredient of recipe.ingredients) {
                const key = ingredient.ingredient.toLowerCase();

                if (ingredientsMap.has(key)) {
                    const existing = ingredientsMap.get(key);
                    existing.recipes.push(recipe.title);
                    // TODO: Smart quantity consolidation
                } else {
                    ingredientsMap.set(key, {
                        name: ingredient.ingredient,
                        quantity: ingredient.quantity,
                        unit: ingredient.unit,
                        recipes: [recipe.title],
                        recipeId: recipe.id,
                        recipeName: recipe.title,
                    });
                }
            }
        }

        // Convert map to array and add to database
        const groceryItems = Array.from(ingredientsMap.values());

        for (const item of groceryItems) {
            await groceryOperations.add({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                recipeId: item.recipeId,
                recipeName: item.recipes.join(', '),
            });
        }

        return {
            success: true,
            itemsAdded: groceryItems.length,
        };
    } catch (error) {
        console.error('Error generating grocery list:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

/**
 * Estimate grocery cost using AI
 */
export const estimateGroceryCost = async (groceryItems, storeName) => {
    await requireAiConfigured();

    try {
        const itemsList = groceryItems
            .filter(item => !item.is_checked)
            .map(item => `- ${item.quantity || ''} ${item.unit || ''} ${item.name}`)
            .join('\n');

        const prompt = `You are a grocery pricing expert. Estimate the total cost of this grocery list at ${storeName || 'a typical grocery store'}.

Grocery items:
${itemsList}

Provide:
1. Estimated cost for each item
2. Total estimated cost
3. Brief explanation of your estimate
4. Tips to save money

Return your response in this JSON format (no markdown, no code blocks):

{
  "items": [
    {
      "name": "item name",
      "estimatedCost": number,
      "currency": "USD"
    }
  ],
  "totalCost": number,
  "currency": "USD",
  "explanation": "Brief explanation of estimate",
  "savingsTips": ["tip 1", "tip 2", ...]
}`;

        const text = await generateText(prompt);
        const cleanedText = stripCodeFences(text);

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
};

/**
 * Categorize grocery items by store section
 */
export const categorizeByStoreSection = (groceryItems) => {
    const categories = {
        'Produce': [],
        'Meat & Seafood': [],
        'Dairy & Eggs': [],
        'Bakery': [],
        'Pantry & Canned': [],
        'Frozen': [],
        'Beverages': [],
        'Snacks': [],
        'Other': [],
    };

    const categoryKeywords = {
        'Produce': ['lettuce', 'tomato', 'onion', 'garlic', 'potato', 'carrot', 'celery', 'pepper', 'fruit', 'apple', 'banana', 'orange', 'lemon', 'lime', 'spinach', 'kale', 'broccoli', 'cauliflower'],
        'Meat & Seafood': ['chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'tuna', 'shrimp', 'meat', 'steak', 'ground'],
        'Dairy & Eggs': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg', 'sour cream'],
        'Bakery': ['bread', 'bun', 'roll', 'bagel', 'tortilla', 'pita'],
        'Pantry & Canned': ['rice', 'pasta', 'flour', 'sugar', 'salt', 'pepper', 'oil', 'vinegar', 'sauce', 'canned', 'beans', 'tomato sauce'],
        'Frozen': ['frozen', 'ice cream'],
        'Beverages': ['water', 'juice', 'soda', 'coffee', 'tea', 'milk'],
        'Snacks': ['chips', 'crackers', 'cookies', 'candy'],
    };

    for (const item of groceryItems) {
        const itemName = item.name.toLowerCase();
        let categorized = false;

        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some(keyword => itemName.includes(keyword))) {
                categories[category].push(item);
                categorized = true;
                break;
            }
        }

        if (!categorized) {
            categories['Other'].push(item);
        }
    }

    return categories;
};
