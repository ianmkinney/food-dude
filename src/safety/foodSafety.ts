import { allergyInstruction } from './allergens';

// Rules prepended to every AI request (see aiClient). Kept in one place so Sous,
// AI Chef, imports and estimates all follow the same food-safety baseline.

export const FOOD_SAFETY_RULES = `Food safety rules (always follow):
- Give safe minimum internal temperatures whenever a recipe cooks meat, poultry, eggs or seafood (USDA): poultry and stuffing 165°F/74°C; ground meats 160°F/71°C (ground poultry 165°F); beef, pork, veal and lamb steaks, chops and roasts 145°F/63°C with a 3-minute rest; fish and shellfish 145°F/63°C or until opaque; egg dishes 160°F/71°C; leftovers reheated to 165°F/74°C.
- Warn about raw or undercooked eggs, meat, poultry, fish and shellfish, raw sprouts, raw flour or dough, and unpasteurized milk or juice.
- Don't give home-canning, fermenting-for-storage, or curing times or methods yourself. Point to tested guidance from the USDA and the National Center for Home Food Preservation (nchfp.uga.edu).
- Don't give feeding guidance for infants (including honey before age 1) or for pregnancy; say to ask a pediatrician or doctor.
- Refuse to use anything that isn't food or isn't safe to eat (cleaning products, medicines, supplements in unsafe amounts, non-food items, spoiled or recalled food) and say why.
- You are not a doctor or dietitian. Don't give medical or dietary advice.`;

export function safetyPreamble(allergies: string | null | undefined): string {
    return [FOOD_SAFETY_RULES, allergyInstruction(allergies)].filter(Boolean).join('\n');
}

// Obvious non-food entries people type into a pantry. Filtered on the device
// before "Recipe from Pantry" so they never reach the model.
const NON_FOOD = [
    'bleach', 'detergent', 'soap', 'dish soap', 'shampoo', 'conditioner', 'lotion', 'toothpaste', 'mouthwash',
    'cleaner', 'disinfectant', 'ammonia', 'antifreeze', 'pesticide', 'insecticide', 'rat poison', 'fertilizer',
    'lighter fluid', 'gasoline', 'paint', 'glue', 'battery', 'batteries', 'medicine', 'medication', 'pill', 'pills',
    'tablet', 'ibuprofen', 'acetaminophen', 'aspirin', 'tylenol', 'advil', 'cough syrup', 'laundry', 'dishwasher pod',
    'tide pod', 'silica gel', 'charcoal briquette', 'wd-40', 'drano', 'vape', 'cigarette', 'tobacco', 'cannabis',
];

export function isLikelyNonFood(name: string): boolean {
    const n = name.toLowerCase();
    return NON_FOOD.some((term) => new RegExp(`(^|[^a-z])${term.replace(/[-]/g, '\\-')}([^a-z]|$)`).test(n));
}
