import { GoogleGenerativeAI } from '@google/generative-ai';
import { pantryOperations } from '../database/operations';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const genAI = API_KEY && API_KEY !== 'your_api_key_here' ? new GoogleGenerativeAI(API_KEY) : null;

/**
 * Parse grocery items with AI to determine appropriate packaging
 */
export const parseGroceryItemsWithAI = async (items) => {
    if (!genAI) {
        console.warn('Gemini API not configured. Returning items as-is.');
        // Return items without AI enhancement if API not configured
        return items.map(item => ({
            name: item.name || item,
            quantity: item.quantity || '1',
            unit: item.unit || '',
            category: item.category || null,
            notes: item.notes || null,
        }));
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        // Build the items list for the prompt
        const itemsList = items.map(item => {
            if (typeof item === 'string') {
                return item;
            }
            return `${item.name}${item.quantity ? ` (${item.quantity}${item.unit || ''})` : ''}`;
        }).join('\n');

        const prompt = `You are a grocery shopping assistant. Analyze these grocery items and determine the appropriate way to buy them.

Grocery items:
${itemsList}

For each item, provide:
1. The item name (cleaned up and standardized)
2. Suggested quantity and unit based on how the item is typically sold:
   - Produce (fruits, vegetables): usually sold individually or by weight (e.g., "3" items, "2 lbs")
   - Packaged goods (pasta, rice, cereal): sold by package/box (e.g., "1 box", "1 package")
   - Condiments (ketchup, mayo, soy sauce): sold in bottles/jars (e.g., "1 bottle", "1 jar")
   - Dairy (milk, yogurt): sold by container (e.g., "1 gallon", "1 container")
   - Canned goods: sold by can (e.g., "2 cans")
   - Bulk items (peanut butter, honey): sold in jars/tubs (e.g., "1 jar", "1 tub")
3. Category (Produce, Dairy, Meat, Pantry, etc.)

Return ONLY a JSON array (no markdown, no code blocks) in this exact format:
[
  {
    "name": "standardized item name",
    "quantity": "suggested quantity",
    "unit": "suggested unit (items, lbs, box, jar, bottle, gallon, can, etc.)",
    "category": "category name"
  }
]`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();

        // Clean up response
        if (text.startsWith('```json')) {
            text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (text.startsWith('```')) {
            text = text.replace(/```\n?/g, '');
        }

        const parsedItems = JSON.parse(text);

        // Merge with original item data if available
        return parsedItems.map((parsed, index) => {
            const original = items[index];
            if (typeof original === 'object') {
                return {
                    ...original,
                    name: parsed.name,
                    quantity: parsed.quantity,
                    unit: parsed.unit,
                    category: parsed.category,
                };
            }
            return {
                name: parsed.name,
                quantity: parsed.quantity,
                unit: parsed.unit,
                category: parsed.category,
                notes: null,
            };
        });
    } catch (error) {
        console.error('Error parsing grocery items with AI:', error);
        // Return items as-is on error
        return items.map(item => ({
            name: typeof item === 'string' ? item : item.name,
            quantity: typeof item === 'object' ? item.quantity || '1' : '1',
            unit: typeof item === 'object' ? item.unit || '' : '',
            category: typeof item === 'object' ? item.category || null : null,
            notes: typeof item === 'object' ? item.notes || null : null,
        }));
    }
};

/**
 * Check pantry for matching items using fuzzy matching
 */
export const checkPantryForMatches = async (groceryItemNames) => {
    try {
        const pantryItems = await pantryOperations.getAll();
        const matches = [];

        for (const groceryName of groceryItemNames) {
            const normalizedGroceryName = groceryName.toLowerCase().trim();

            for (const pantryItem of pantryItems) {
                const normalizedPantryName = pantryItem.name.toLowerCase().trim();

                // Check for exact match
                if (normalizedGroceryName === normalizedPantryName) {
                    matches.push({
                        groceryItem: groceryName,
                        pantryItem: pantryItem,
                        matchType: 'exact',
                    });
                    continue;
                }

                // Check if one contains the other
                if (normalizedGroceryName.includes(normalizedPantryName) ||
                    normalizedPantryName.includes(normalizedGroceryName)) {
                    matches.push({
                        groceryItem: groceryName,
                        pantryItem: pantryItem,
                        matchType: 'partial',
                    });
                    continue;
                }

                // Check for singular/plural variations
                const singularGrocery = normalizedGroceryName.replace(/s$/, '');
                const singularPantry = normalizedPantryName.replace(/s$/, '');

                if (singularGrocery === singularPantry) {
                    matches.push({
                        groceryItem: groceryName,
                        pantryItem: pantryItem,
                        matchType: 'singular',
                    });
                }
            }
        }

        return matches;
    } catch (error) {
        console.error('Error checking pantry for matches:', error);
        return [];
    }
};

/**
 * Calculate similarity score between two strings (Levenshtein distance)
 */
const calculateSimilarity = (str1, str2) => {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) {
            costs[s2.length] = lastValue;
        }
    }

    const maxLength = Math.max(s1.length, s2.length);
    return maxLength === 0 ? 1 : (maxLength - costs[s2.length]) / maxLength;
};

/**
 * Simplify grocery list by consolidating items and providing brand recommendations
 */
export const simplifyGroceryList = async (groceryItems, storeName = '', storeLocation = '') => {
    if (!genAI) {
        throw new Error('Gemini API not configured. Please add your API key to .env file.');
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        // Filter out checked items
        const uncheckedItems = groceryItems.filter(item => !item.is_checked);

        if (uncheckedItems.length === 0) {
            return {
                success: false,
                error: 'No unchecked items to simplify',
            };
        }

        // Build the items list for the prompt
        const itemsList = uncheckedItems.map(item => {
            return `- ${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ' ' + item.unit : ''})` : ''}${item.category ? ` [${item.category}]` : ''}`;
        }).join('\n');

        // Build store context
        let storeContext = '';
        if (storeName) {
            storeContext = `\n\nStore Information:
- Store Name: ${storeName}${storeLocation ? `\n- Location: ${storeLocation}` : ''}

Based on this store, recommend specific brands that are typically available at ${storeName}. For example:
- Walmart: Great Value, Equate, Member's Mark
- Target: Good & Gather, Market Pantry, Up & Up
- Whole Foods: 365 by Whole Foods Market
- Kroger: Simple Truth, Private Selection
- Costco: Kirkland Signature
- Generic stores: Recommend popular national brands or store brands`;

            if (storeLocation) {
                storeContext += `\n\nConsider regional availability in ${storeLocation} when making brand recommendations.`;
            }
        }

        const prompt = `You are an expert grocery shopping optimizer. Analyze this grocery list and simplify it by:

1. Consolidating duplicate or similar items
2. Optimizing quantities (combine if needed)
3. Standardizing units
4. Removing redundancies
5. Providing specific brand recommendations available at the specified store with estimated prices
6. Recommending the best value options (store brands when available, otherwise quality budget brands)

Current grocery list:
${itemsList}${storeContext}

Provide a simplified, optimized grocery list with:
- Consolidated items with optimized quantities
- Specific brand recommendations that are typically available at ${storeName || 'the store'} (use actual brand names like "Great Value", "Kirkland Signature", "365 by Whole Foods", etc.)
- Estimated price per item (in USD) based on typical prices at ${storeName || 'grocery stores'}
- Brief explanation of what was consolidated and why these brands were recommended

Return ONLY a JSON object (no markdown, no code blocks) in this exact format:
{
  "simplifiedItems": [
    {
      "name": "item name",
      "quantity": "optimized quantity",
      "unit": "unit",
      "category": "category",
      "brandRecommendation": "specific brand name available at ${storeName || 'the store'} (e.g., 'Great Value', 'Kirkland Signature', '365 by Whole Foods', 'Simple Truth')",
      "estimatedPrice": number,
      "notes": "optional consolidation notes or why this brand was recommended"
    }
  ],
  "summary": {
    "originalCount": number,
    "simplifiedCount": number,
    "itemsConsolidated": ["list of what was consolidated"],
    "estimatedTotalSavings": number,
    "explanation": "brief explanation of optimizations made and brand recommendations"
  }
}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();

        // Clean up response
        if (text.startsWith('```json')) {
            text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (text.startsWith('```')) {
            text = text.replace(/```\n?/g, '');
        }

        const simplificationResult = JSON.parse(text);

        return {
            success: true,
            data: {
                originalItems: uncheckedItems,
                simplifiedItems: simplificationResult.simplifiedItems,
                summary: simplificationResult.summary,
            },
        };
    } catch (error) {
        console.error('Error simplifying grocery list:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

