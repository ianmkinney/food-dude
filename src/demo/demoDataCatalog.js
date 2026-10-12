/** Shared deterministic demo content (also used by screenshot seeds). */

export const DEMO_PARTY_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export const DEMO_RECIPES = [
    {
        title: 'Weeknight Tomato Pasta',
        description: 'Garlic, olive oil, and canned tomatoes in twenty minutes.',
        totalTime: 25,
        difficulty: 'easy',
        servings: 4,
        calories: 420,
        protein: 14,
        carbohydrates: 62,
        fat: 12,
        ingredients: [
            { ingredient: 'spaghetti', quantity: '12', unit: 'oz' },
            { ingredient: 'canned tomatoes', quantity: '1', unit: 'can' },
            { ingredient: 'garlic', quantity: '4', unit: 'cloves' },
        ],
        instructions: ['Boil pasta.', 'Simmer tomatoes with garlic and olive oil.', 'Toss and serve.'],
    },
    {
        title: 'Sheet-Pan Lemon Chicken',
        description: 'Crispy chicken with potatoes and green beans.',
        totalTime: 45,
        difficulty: 'medium',
        servings: 4,
        calories: 510,
        protein: 38,
        carbohydrates: 28,
        fat: 26,
        ingredients: [
            { ingredient: 'chicken thighs', quantity: '4', unit: '' },
            { ingredient: 'potatoes', quantity: '1', unit: 'lb' },
            { ingredient: 'green beans', quantity: '12', unit: 'oz' },
        ],
        instructions: ['Roast at 425°F until chicken reaches 165°F.', 'Finish with lemon and herbs.'],
    },
    {
        title: 'Greek Salad Bowl',
        description: 'Crunchy cucumbers, feta, and lemon oregano dressing.',
        totalTime: 15,
        difficulty: 'easy',
        servings: 2,
        calories: 320,
        protein: 12,
        carbohydrates: 18,
        fat: 22,
        ingredients: [
            { ingredient: 'cucumber', quantity: '1', unit: '' },
            { ingredient: 'feta', quantity: '4', unit: 'oz' },
            { ingredient: 'olive oil', quantity: '2', unit: 'tbsp' },
        ],
        instructions: ['Chop vegetables.', 'Toss with dressing and feta.'],
    },
    {
        title: 'Overnight Oats',
        description: 'Creamy oats with berries for busy mornings.',
        totalTime: 5,
        difficulty: 'easy',
        servings: 1,
        calories: 280,
        protein: 10,
        carbohydrates: 45,
        fat: 7,
        ingredients: [
            { ingredient: 'rolled oats', quantity: '1/2', unit: 'cup' },
            { ingredient: 'milk', quantity: '1/2', unit: 'cup' },
            { ingredient: 'berries', quantity: '1/2', unit: 'cup' },
        ],
        instructions: ['Combine oats and milk.', 'Refrigerate overnight.', 'Top with berries.'],
    },
    {
        title: 'Black Bean Tacos',
        description: 'Smoky beans, quick slaw, and lime.',
        totalTime: 20,
        difficulty: 'easy',
        servings: 3,
        calories: 390,
        protein: 16,
        carbohydrates: 52,
        fat: 11,
        ingredients: [
            { ingredient: 'black beans', quantity: '1', unit: 'can' },
            { ingredient: 'tortillas', quantity: '6', unit: '' },
            { ingredient: 'lime', quantity: '1', unit: '' },
        ],
        instructions: ['Warm beans with spices.', 'Fill tortillas and finish with lime.'],
    },
    {
        title: 'Salmon Rice Bowl',
        description: 'Sesame salmon over rice with quick pickles.',
        totalTime: 35,
        difficulty: 'medium',
        servings: 2,
        calories: 540,
        protein: 32,
        carbohydrates: 48,
        fat: 20,
        ingredients: [
            { ingredient: 'salmon fillet', quantity: '2', unit: '' },
            { ingredient: 'rice', quantity: '1', unit: 'cup' },
            { ingredient: 'soy sauce', quantity: '2', unit: 'tbsp' },
        ],
        instructions: ['Cook rice.', 'Pan-sear salmon.', 'Assemble bowls.'],
    },
    {
        title: 'Veggie Frittata',
        description: 'Baked eggs with spinach and peppers.',
        totalTime: 30,
        difficulty: 'easy',
        servings: 4,
        calories: 260,
        protein: 18,
        carbohydrates: 6,
        fat: 18,
        ingredients: [
            { ingredient: 'eggs', quantity: '8', unit: '' },
            { ingredient: 'spinach', quantity: '2', unit: 'cups' },
            { ingredient: 'bell pepper', quantity: '1', unit: '' },
        ],
        instructions: ['Sauté vegetables.', 'Pour in eggs and bake until set.'],
    },
    {
        title: 'Mushroom Risotto',
        description: 'Creamy arborio rice with thyme.',
        totalTime: 40,
        difficulty: 'medium',
        servings: 4,
        calories: 480,
        protein: 11,
        carbohydrates: 68,
        fat: 16,
        ingredients: [
            { ingredient: 'arborio rice', quantity: '1.5', unit: 'cups' },
            { ingredient: 'mushrooms', quantity: '8', unit: 'oz' },
            { ingredient: 'parmesan', quantity: '1/2', unit: 'cup' },
        ],
        instructions: ['Toast rice.', 'Add stock gradually.', 'Finish with mushrooms and cheese.'],
    },
    {
        title: 'Turkey Chili',
        description: 'Hearty weeknight chili with beans.',
        totalTime: 45,
        difficulty: 'easy',
        servings: 6,
        calories: 350,
        protein: 28,
        carbohydrates: 32,
        fat: 12,
        ingredients: [
            { ingredient: 'ground turkey', quantity: '1', unit: 'lb' },
            { ingredient: 'kidney beans', quantity: '1', unit: 'can' },
            { ingredient: 'chili powder', quantity: '2', unit: 'tbsp' },
        ],
        instructions: ['Brown turkey.', 'Simmer with beans and spices 25 minutes.'],
    },
    {
        title: 'Caprese Sandwich',
        description: 'Tomato, mozzarella, and basil on ciabatta.',
        totalTime: 10,
        difficulty: 'easy',
        servings: 2,
        calories: 410,
        protein: 18,
        carbohydrates: 38,
        fat: 20,
        ingredients: [
            { ingredient: 'ciabatta', quantity: '1', unit: 'loaf' },
            { ingredient: 'mozzarella', quantity: '8', unit: 'oz' },
            { ingredient: 'tomato', quantity: '2', unit: '' },
        ],
        instructions: ['Layer ingredients on bread.', 'Drizzle with olive oil and balsamic.'],
    },
    {
        title: 'Berry Smoothie',
        description: 'Frozen berries, yogurt, and honey.',
        totalTime: 5,
        difficulty: 'easy',
        servings: 2,
        calories: 190,
        protein: 8,
        carbohydrates: 32,
        fat: 3,
        ingredients: [
            { ingredient: 'frozen berries', quantity: '1', unit: 'cup' },
            { ingredient: 'yogurt', quantity: '1', unit: 'cup' },
            { ingredient: 'honey', quantity: '1', unit: 'tbsp' },
        ],
        instructions: ['Blend until smooth.'],
    },
    {
        title: 'Garlic Shrimp Skewers',
        description: 'Quick grill or broil with parsley butter.',
        totalTime: 20,
        difficulty: 'medium',
        servings: 3,
        calories: 220,
        protein: 24,
        carbohydrates: 2,
        fat: 12,
        ingredients: [
            { ingredient: 'shrimp', quantity: '1', unit: 'lb' },
            { ingredient: 'garlic', quantity: '3', unit: 'cloves' },
            { ingredient: 'butter', quantity: '2', unit: 'tbsp' },
        ],
        instructions: ['Marinate shrimp.', 'Skewer and cook 3–4 minutes per side.'],
    },
];

export const DEMO_GROCERY = [
    { name: 'Eggs', category: 'Dairy' },
    { name: 'Milk', category: 'Dairy' },
    { name: 'Greek yogurt', category: 'Dairy' },
    { name: 'Chicken thighs', category: 'Meat' },
    { name: 'Salmon fillet', category: 'Seafood' },
    { name: 'Spinach', category: 'Produce' },
    { name: 'Bell peppers', category: 'Produce' },
    { name: 'Tomatoes', category: 'Produce' },
    { name: 'Berries', category: 'Produce' },
    { name: 'Basil', category: 'Produce' },
    { name: 'Olive oil', category: 'Pantry' },
    { name: 'Spaghetti', category: 'Pantry' },
    { name: 'Black beans', category: 'Pantry' },
    { name: 'Tortillas', category: 'Pantry' },
    { name: 'Honey', category: 'Pantry' },
];

function daysFromToday(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
}

export function demoMealPlanEntries(recipeIdsByTitle) {
    const types = ['breakfast', 'lunch', 'dinner'];
    const picks = [
        'Overnight Oats',
        'Caprese Sandwich',
        'Weeknight Tomato Pasta',
        'Berry Smoothie',
        'Greek Salad Bowl',
        'Salmon Rice Bowl',
        'Veggie Frittata',
        'Black Bean Tacos',
        'Turkey Chili',
        'Mushroom Risotto',
        'Sheet-Pan Lemon Chicken',
        'Garlic Shrimp Skewers',
        'Greek Salad Bowl',
        'Caprese Sandwich',
        'Veggie Frittata',
        'Berry Smoothie',
        'Overnight Oats',
        'Black Bean Tacos',
        'Salmon Rice Bowl',
        'Turkey Chili',
        'Weeknight Tomato Pasta',
    ];
    const out = [];
    for (let day = 0; day < 7; day++) {
        for (let slot = 0; slot < 3; slot++) {
            const title = picks[day * 3 + slot];
            const recipeId = recipeIdsByTitle[title];
            if (!recipeId) continue;
            out.push({
                recipeId,
                date: daysFromToday(day),
                mealType: types[slot],
                servings: 2,
            });
        }
    }
    return out;
}

export const DEMO_PANTRY = [
    { name: 'Olive oil', category: 'Pantry', expirationDate: daysFromToday(120), freshnessPct: 90, amountPct: 70 },
    { name: 'Garlic', category: 'Produce', expirationDate: daysFromToday(10), freshnessPct: 85, amountPct: 60 },
    { name: 'Onions', category: 'Produce', expirationDate: daysFromToday(14), freshnessPct: 80, amountPct: 50 },
    { name: 'Eggs', category: 'Dairy', expirationDate: daysFromToday(7), freshnessPct: 95, amountPct: 40 },
    { name: 'Milk', category: 'Dairy', expirationDate: daysFromToday(5), freshnessPct: 88, amountPct: 35 },
    { name: 'Butter', category: 'Dairy', expirationDate: daysFromToday(21), freshnessPct: 92, amountPct: 55 },
    { name: 'Rice', category: 'Pantry', expirationDate: daysFromToday(200), freshnessPct: 100, amountPct: 65 },
    { name: 'Pasta', category: 'Pantry', expirationDate: daysFromToday(180), freshnessPct: 100, amountPct: 80 },
    { name: 'Canned tomatoes', category: 'Pantry', expirationDate: daysFromToday(300), freshnessPct: 100, amountPct: 75 },
    { name: 'Black beans', category: 'Pantry', expirationDate: daysFromToday(400), freshnessPct: 100, amountPct: 100 },
    { name: 'Frozen berries', category: 'Freezer', expirationDate: daysFromToday(60), freshnessPct: 98, amountPct: 45 },
    { name: 'Chicken thighs', category: 'Meat', expirationDate: daysFromToday(3), freshnessPct: 90, amountPct: 100 },
    { name: 'Salmon', category: 'Seafood', expirationDate: daysFromToday(2), freshnessPct: 88, amountPct: 100 },
    { name: 'Spinach', category: 'Produce', expirationDate: daysFromToday(4), freshnessPct: 70, amountPct: 55 },
    { name: 'Bell pepper', category: 'Produce', expirationDate: daysFromToday(6), freshnessPct: 82, amountPct: 70 },
    { name: 'Lemon', category: 'Produce', expirationDate: daysFromToday(12), freshnessPct: 86, amountPct: 50 },
    { name: 'Parmesan', category: 'Dairy', expirationDate: daysFromToday(30), freshnessPct: 94, amountPct: 40 },
    { name: 'Soy sauce', category: 'Pantry', expirationDate: daysFromToday(365), freshnessPct: 100, amountPct: 60 },
    { name: 'Honey', category: 'Pantry', expirationDate: daysFromToday(500), freshnessPct: 100, amountPct: 30 },
    { name: 'Yogurt', category: 'Dairy', expirationDate: daysFromToday(8), freshnessPct: 91, amountPct: 50 },
];
