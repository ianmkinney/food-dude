/**
 * @param {{ title?: string, description?: string, cuisine?: string, difficulty?: string, ingredients?: { ingredient?: string }[] }} recipe
 */
export function buildRecipeImagePrompt(recipe) {
    const title = recipe?.title || 'Dish';
    const description = recipe?.description || 'A delicious recipe';
    const cuisine = recipe?.cuisine || 'General';
    const difficulty = recipe?.difficulty || 'Medium';
    const ingredients = (recipe?.ingredients || [])
        .slice(0, 8)
        .map((ing) => ing?.ingredient)
        .filter(Boolean)
        .join(', ');

    return `Generate a professional, appetizing food photography image of this dish:

Title: ${title}
Description: ${description}
Cuisine: ${cuisine}
Difficulty: ${difficulty}

Key Ingredients: ${ingredients || 'various ingredients'}

Requirements:
- Professional food photography style
- High quality, well-lit, appetizing presentation
- Realistic plating and garnish
- Restaurant-quality presentation
- Focus on the finished dish
- Warm, inviting atmosphere

Create a beautiful, mouth-watering photo that makes viewers want to cook and eat this dish.`;
}
