// Hand-written (not AI) recipes for the tour when the user has no AI key or
// chooses "Not now". Labelled "Sample · not AI" everywhere they appear.

export type DemoRecipe = {
    title: string;
    description: string;
    servings: number;
    prepTime: number;
    cookTime: number;
    ingredients: { ingredient: string; quantity: string; unit: string }[];
    instructions: string[];
    source: 'ai' | 'sample';
};

const r = (
    title: string,
    description: string,
    servings: number,
    prepTime: number,
    cookTime: number,
    ingredients: [string, string, string][],
    instructions: string[]
): DemoRecipe => ({
    title,
    description,
    servings,
    prepTime,
    cookTime,
    ingredients: ingredients.map(([quantity, unit, ingredient]) => ({ quantity, unit, ingredient })),
    instructions,
    source: 'sample',
});

export const SAMPLE_RECIPES: DemoRecipe[] = [
    r('Sheet-Pan Lemon Chicken & Potatoes', 'Crispy potatoes and juicy chicken thighs on one pan.', 4, 10, 40,
        [['1.5', 'lb', 'chicken thighs'], ['1.5', 'lb', 'baby potatoes'], ['1', '', 'lemon'], ['3', 'tbsp', 'olive oil'], ['4', 'cloves', 'garlic'], ['1', 'tsp', 'dried oregano']],
        ['Heat the oven to 425°F (220°C).', 'Toss potatoes and chicken with oil, garlic, oregano, lemon juice, salt and pepper.', 'Roast 35–40 minutes until the chicken reaches 165°F (74°C).']),
    r('Black Bean Tacos', 'Smoky beans, avocado and lime in warm corn tortillas.', 4, 10, 10,
        [['2', 'cans', 'black beans'], ['8', '', 'corn tortillas'], ['1', '', 'avocado'], ['1', 'cup', 'salsa'], ['1', '', 'lime'], ['1', 'tsp', 'cumin']],
        ['Warm the beans with cumin and a splash of water; mash lightly.', 'Warm the tortillas.', 'Fill with beans, avocado, salsa and a squeeze of lime.']),
    r('Tomato Basil Spaghetti', 'Blistered cherry tomatoes, garlic and basil.', 2, 5, 15,
        [['8', 'oz', 'spaghetti'], ['1', 'pint', 'cherry tomatoes'], ['3', 'cloves', 'garlic'], ['1', 'handful', 'fresh basil'], ['2', 'tbsp', 'olive oil']],
        ['Boil the pasta.', 'Blister tomatoes in hot oil with garlic.', 'Toss with pasta and basil.']),
    r('Veggie Fried Rice', 'Leftover rice, eggs and whatever vegetables you have.', 2, 10, 10,
        [['3', 'cups', 'cooked rice'], ['2', '', 'eggs'], ['1', 'cup', 'frozen peas and carrots'], ['2', 'tbsp', 'soy sauce'], ['2', '', 'green onions'], ['1', 'tbsp', 'vegetable oil']],
        ['Scramble the eggs in hot oil until fully set; set aside.', 'Stir-fry vegetables, then rice, until hot.', 'Add soy sauce, eggs and green onions.']),
    r('Peanut Noodle Bowl', 'Cold noodles in a quick peanut-lime sauce.', 2, 10, 10,
        [['6', 'oz', 'wheat noodles'], ['3', 'tbsp', 'peanut butter'], ['2', 'tbsp', 'soy sauce'], ['1', '', 'lime'], ['1', '', 'cucumber'], ['1', 'tbsp', 'honey']],
        ['Cook and rinse the noodles.', 'Whisk peanut butter, soy sauce, lime and honey with warm water.', 'Toss with noodles and cucumber.']),
    r('Overnight Oats with Berries', 'Make-ahead breakfast with oats, yogurt and berries.', 1, 5, 0,
        [['1/2', 'cup', 'rolled oats'], ['1/2', 'cup', 'Greek yogurt'], ['1/2', 'cup', 'milk'], ['1/2', 'cup', 'berries'], ['1', 'tbsp', 'sliced almonds']],
        ['Stir oats, yogurt and milk in a jar.', 'Refrigerate overnight.', 'Top with berries and almonds.']),
];
