import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system/legacy';

// ... (existing imports and code)

/**
 * Extract recipe from images (screenshots)
 */
export const parseRecipeFromImages = async (imageUris) => {
    if (!genAI) {
        throw new Error('Gemini API not configured. Please add your API key to .env file.');
    }

    try {
        // Use gemini-1.5-flash which supports multimodal input (images)
        // Note: 2.5-flash might also support it, but 1.5-flash is standard for multimodal
        // Let's try 2.5-flash first as we are using it elsewhere, if it fails we might need 1.5-flash
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `You are a recipe extraction expert. Analyze these images (screenshots of a recipe) and extract the structured recipe data.
        
RULES:
1. Combine information from all images if the recipe spans multiple screenshots.
2. Ignore UI elements, ads, or irrelevant text.
3. Return ONLY a valid JSON object with the standard structure.
4. Identify which image (0-indexed) is the best photo of the finished dish or food. If none of the images contain a clear photo of the food (e.g. only text/ingredients), return -1 for "mainImageIndex".
5. Extract nutritional information if visible in the images. If not visible, calculate close approximations based on ingredients and cooking methods.

JSON Structure:
{
  "title": "Recipe title",
  "description": "Brief description",
  "servings": number or null,
  "prepTime": minutes as number or null,
  "cookTime": minutes as number or null,
  "totalTime": minutes as number or null,
  "difficulty": "easy" | "medium" | "hard" or null,
  "cuisine": "cuisine type" or null,
  "ingredients": [
    {
      "ingredient": "ingredient name",
      "quantity": "amount",
      "unit": "unit",
      "section": "section name" or null
    }
  ],
  "instructions": ["step 1", "step 2", ...],
  "tags": ["tag1", "tag2", ...],
  "mainImageIndex": number (index of the best food photo, or -1 if none),
  "calories": number (per serving, or null if cannot estimate),
  "protein": number (grams per serving, or null if cannot estimate),
  "carbohydrates": number (grams per serving, or null if cannot estimate),
  "fat": number (grams per serving, or null if cannot estimate),
  "fiber": number (grams per serving, or null if cannot estimate),
  "sugar": number (grams per serving, or null if cannot estimate),
  "sodium": number (milligrams per serving, or null if cannot estimate)
}

For nutritional info:
- If nutritional information is visible in the images, extract it exactly.
- If not visible, calculate realistic estimates based on ingredient quantities and cooking methods.
- Use standard nutritional databases for common ingredients.
- All values should be per serving, not for the entire recipe.
- If you cannot make a reasonable estimate, use null for that field.`;

        // Prepare images for Gemini
        const imageParts = await Promise.all(imageUris.map(async (uri) => {
            // Read file as base64
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            return {
                inlineData: {
                    data: base64,
                    mimeType: 'image/jpeg', // Assuming jpeg/png, Gemini is flexible
                },
            };
        }));

        const result = await retryOperation(() => model.generateContent([prompt, ...imageParts]));
        const response = await result.response;
        const text = response.text();

        // Clean up response
        let cleanedText = text.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/```\n?/g, '');
        }

        const parsedRecipe = JSON.parse(cleanedText);

        // Determine which image to use
        let finalImageUri = null;
        if (parsedRecipe.mainImageIndex !== undefined && parsedRecipe.mainImageIndex >= 0 && parsedRecipe.mainImageIndex < imageUris.length) {
            finalImageUri = imageUris[parsedRecipe.mainImageIndex];
        } else if (parsedRecipe.mainImageIndex === -1) {
            finalImageUri = null; // Explicitly no image
        } else {
            // Fallback: if AI didn't return index or it's invalid, use first one? 
            // User requested "no image is used if only text is in images".
            // If AI failed to identify, maybe default to null to be safe?
            // Or default to first one if we are unsure. 
            // Let's trust the AI's -1. If it's missing, we might default to null to respect the "only text" rule.
            finalImageUri = null;
        }

        // Remove the helper field from the final object
        delete parsedRecipe.mainImageIndex;

        return {
            success: true,
            recipe: {
                ...parsedRecipe,
                imageUri: finalImageUri
            },
        };

    } catch (error) {
        console.error('Error parsing recipe from images:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

console.log('RecipeParser: API Key present?', !!API_KEY);
console.log('RecipeParser: GoogleGenerativeAI imported?', !!GoogleGenerativeAI);

if (!API_KEY || API_KEY === 'your_api_key_here') {
    console.warn('⚠️ Gemini API key not configured. Please add EXPO_PUBLIC_GEMINI_API_KEY to your .env file');
}

let genAI = null;
try {
    if (API_KEY && API_KEY !== 'your_api_key_here') {
        genAI = new GoogleGenerativeAI(API_KEY);
        console.log('RecipeParser: Gemini API initialized successfully');
    }
} catch (e) {
    console.error('RecipeParser: Error initializing Gemini API:', e);
}

// Helper function for retrying operations
const retryOperation = async (operation, maxRetries = 5, delay = 2000) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error; // Throw on last retry

            // Check if it's a 503 or network error
            if (error.message.includes('503') || error.message.includes('overloaded') || error.message.includes('fetch')) {
                console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
            } else {
                throw error; // Don't retry other errors
            }
        }
    }
};

/**
 * Parse recipe from text, URL, or social media post
 * Extracts structured recipe data including ingredients, instructions, etc.
 */
export const parseRecipe = async (input) => {
    if (!genAI) {
        throw new Error('Gemini API not configured. Please add your API key to .env file.');
    }

    try {
        // Use 2.5-flash (it exists, just overloaded sometimes)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `You are a recipe extraction expert. Your task is to extract a structured recipe from the provided text, which may be a social media caption (Instagram, TikTok, etc.).

RULES:
1. Ignore emojis, hashtags, "link in bio", and promotional text.
2. If the title is not explicitly labeled, infer a suitable title from the first few lines or the most prominent food name.
3. Extract ingredients carefully. If quantities are mixed with text (e.g., "1 cup of flour"), separate them.
4. Extract instructions as a clear, step-by-step list. If they are in a paragraph, break them down.
5. Return ONLY a valid JSON object with this exact structure.

EXAMPLE INPUT:
"✨ CREAMY PASTA 🍝 👇
Save this for later! Link in bio!
Ingredients:
- 1lb pasta
- 2 cups heavy cream
- 1/2 cup parm
Instructions:
Boil pasta. Simmer cream and parm. Toss together. Enjoy! #pasta #yum"

EXAMPLE JSON OUTPUT:
{
  "title": "Creamy Pasta",
  "description": "A simple and delicious creamy pasta dish.",
  "ingredients": [
    {"ingredient": "pasta", "quantity": "1", "unit": "lb", "section": null},
    {"ingredient": "heavy cream", "quantity": "2", "unit": "cups", "section": null},
    {"ingredient": "parm", "quantity": "1/2", "unit": "cup", "section": null}
  ],
  "instructions": ["Boil the pasta according to package directions.", "Simmer heavy cream and parmesan cheese in a pan.", "Toss the pasta with the sauce.", "Serve and enjoy."]
}

JSON Structure:
{
  "title": "Recipe title",
  "description": "Brief description (inferred from context if needed)",
  "servings": number or null,
  "prepTime": minutes as number or null,
  "cookTime": minutes as number or null,
  "totalTime": minutes as number or null,
  "difficulty": "easy" | "medium" | "hard" or null,
  "cuisine": "cuisine type" or null,
  "ingredients": [
    {
      "ingredient": "ingredient name (e.g. 'Flour')",
      "quantity": "amount (e.g. '1')",
      "unit": "unit (e.g. 'cup') - use null if none",
      "section": "section name (e.g. 'Sauce') or null"
    }
  ],
  "instructions": ["step 1", "step 2", ...],
  "tags": ["tag1", "tag2", ...],
  "calories": number (per serving, or null if cannot estimate),
  "protein": number (grams per serving, or null if cannot estimate),
  "carbohydrates": number (grams per serving, or null if cannot estimate),
  "fat": number (grams per serving, or null if cannot estimate),
  "fiber": number (grams per serving, or null if cannot estimate),
  "sugar": number (grams per serving, or null if cannot estimate),
  "sodium": number (milligrams per serving, or null if cannot estimate)
}

For nutritional info:
- If nutritional information is present in the text, extract it exactly.
- If not present, calculate realistic estimates based on ingredient quantities and cooking methods.
- Use standard nutritional databases for common ingredients.
- All values should be per serving, not for the entire recipe.
- If you cannot make a reasonable estimate, use null for that field.

Recipe content to parse:
${input}`;

        const result = await retryOperation(() => model.generateContent(prompt));
        const response = await result.response;
        const text = response.text();

        // Clean up the response - remove markdown code blocks if present
        let cleanedText = text.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/```\n?/g, '');
        }

        const parsedRecipe = JSON.parse(cleanedText);

        return {
            success: true,
            recipe: parsedRecipe,
        };
    } catch (error) {
        console.error('Error parsing recipe:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

/**
 * Extract recipe from a URL (web scraping via AI)
 */
export const parseRecipeFromUrl = async (url) => {
    if (!genAI) {
        throw new Error('Gemini API not configured. Please add your API key to .env file.');
    }

    try {
        // Fetch the webpage content
        const fetchResponse = await fetch(url);
        const html = await fetchResponse.text();

        // Use AI to extract recipe from HTML
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `Extract the recipe from this webpage HTML and return ONLY a valid JSON object (no markdown, no code blocks):

{
  "title": "Recipe title",
  "description": "Brief description",
  "servings": number or null,
  "prepTime": minutes as number or null,
  "cookTime": minutes as number or null,
  "totalTime": minutes as number or null,
  "difficulty": "easy" | "medium" | "hard" or null,
  "cuisine": "cuisine type" or null,
  "ingredients": [
    {
      "ingredient": "ingredient name",
      "quantity": "amount",
      "unit": "unit of measurement"
    }
  ],
  "instructions": ["step 1", "step 2", ...],
  "tags": ["tag1", "tag2", ...],
  "calories": number (per serving, or null if cannot estimate),
  "protein": number (grams per serving, or null if cannot estimate),
  "carbohydrates": number (grams per serving, or null if cannot estimate),
  "fat": number (grams per serving, or null if cannot estimate),
  "fiber": number (grams per serving, or null if cannot estimate),
  "sugar": number (grams per serving, or null if cannot estimate),
  "sodium": number (milligrams per serving, or null if cannot estimate)
}

For nutritional info:
- If nutritional information is present in the HTML, extract it exactly.
- If not present, calculate realistic estimates based on ingredient quantities and cooking methods.
- Use standard nutritional databases for common ingredients.
- All values should be per serving, not for the entire recipe.
- If you cannot make a reasonable estimate, use null for that field.

HTML content (truncated to first 10000 chars):
${html.substring(0, 10000)}`;

        const result = await retryOperation(() => model.generateContent(prompt));
        const aiResponse = await result.response;
        const text = aiResponse.text();

        // Clean up the response
        let cleanedText = text.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/```\n?/g, '');
        }

        const parsedRecipe = JSON.parse(cleanedText);

        return {
            success: true,
            recipe: {
                ...parsedRecipe,
                sourceUrl: url,
                sourcePlatform: new URL(url).hostname,
            },
        };
    } catch (error) {
        console.error('Error parsing recipe from URL:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

/**
 * Validate if text contains a recipe
 */
export const isRecipeContent = async (text) => {
    if (!genAI) {
        return false;
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `Does the following text contain a recipe with ingredients and cooking instructions? 
Answer with only "YES" or "NO".

Text:
${text.substring(0, 1000)}`;

        const result = await retryOperation(() => model.generateContent(prompt));
        const validationResponse = await result.response;
        const answer = validationResponse.text().trim().toUpperCase();

        return answer === 'YES';
    } catch (error) {
        console.error('Error validating recipe content:', error);
        return false;
    }
};
