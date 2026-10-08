// On-device allergen check. The AI is told to leave the user's allergens out,
// but models miss hidden ingredients, so every recipe is also scanned locally
// against this synonym map before it's shown. The list is a safety net, not a
// guarantee; the UI says so.

const SYNONYMS: Record<string, string[]> = {
    peanut: ['peanut', 'peanuts', 'groundnut', 'arachis', 'satay', 'goober', 'monkey nut', 'beer nut', 'mandelona', 'nutella', 'peanut butter', 'peanut oil', 'kare-kare'],
    'tree nut': ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'filbert', 'macadamia', 'brazil nut', 'pine nut', 'pignoli', 'chestnut', 'praline', 'marzipan', 'frangipane', 'gianduja', 'nougat', 'pesto', 'amaretto', 'nut butter', 'nut milk', 'almond milk', 'orgeat'],
    milk: ['milk', 'dairy', 'butter', 'ghee', 'cream', 'cheese', 'yogurt', 'yoghurt', 'whey', 'casein', 'caseinate', 'lactose', 'paneer', 'ricotta', 'mascarpone', 'parmesan', 'mozzarella', 'custard', 'buttermilk', 'kefir', 'creme fraiche', 'crème fraîche', 'bechamel', 'béchamel', 'alfredo', 'queso'],
    egg: ['egg', 'eggs', 'yolk', 'albumen', 'albumin', 'mayonnaise', 'mayo', 'aioli', 'meringue', 'custard', 'hollandaise', 'béarnaise', 'bearnaise', 'eggnog', 'frittata', 'quiche', 'carbonara'],
    wheat: ['wheat', 'flour', 'bread', 'breadcrumbs', 'panko', 'pasta', 'spaghetti', 'noodle', 'noodles', 'couscous', 'semolina', 'durum', 'farro', 'spelt', 'bulgur', 'seitan', 'udon', 'ramen', 'tortilla', 'pita', 'croissant', 'cracker', 'roux', 'soy sauce', 'teriyaki', 'beer'],
    gluten: ['gluten', 'wheat', 'barley', 'rye', 'malt', 'flour', 'bread', 'breadcrumbs', 'panko', 'pasta', 'spaghetti', 'noodle', 'couscous', 'semolina', 'farro', 'spelt', 'bulgur', 'seitan', 'udon', 'ramen', 'soy sauce', 'teriyaki', 'beer', 'brewer'],
    soy: ['soy', 'soya', 'soybean', 'tofu', 'edamame', 'miso', 'tempeh', 'tamari', 'soy sauce', 'shoyu', 'teriyaki', 'natto', 'lecithin'],
    fish: ['fish', 'anchovy', 'anchovies', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'sardine', 'mackerel', 'bass', 'snapper', 'haddock', 'pollock', 'fish sauce', 'nam pla', 'worcestershire', 'caesar dressing', 'bonito', 'dashi', 'surimi'],
    shellfish: ['shellfish', 'shrimp', 'prawn', 'crab', 'lobster', 'crawfish', 'crayfish', 'langoustine', 'clam', 'mussel', 'oyster', 'scallop', 'squid', 'calamari', 'octopus', 'oyster sauce', 'shrimp paste', 'xo sauce'],
    sesame: ['sesame', 'tahini', 'halva', 'halvah', 'gomasio', 'hummus', "za'atar", 'zaatar', 'benne', 'sesame oil'],
    mustard: ['mustard', 'dijon'],
    celery: ['celery', 'celeriac'],
    sulfite: ['sulfite', 'sulphite', 'wine', 'dried apricot'],
    corn: ['corn', 'maize', 'cornstarch', 'cornmeal', 'polenta', 'grits', 'masa', 'corn syrup'],
};

// Words people use for an allergy -> the canonical key above.
const ALIASES: Record<string, string> = {
    peanuts: 'peanut', 'tree nuts': 'tree nut', nuts: 'tree nut', nut: 'tree nut',
    dairy: 'milk', lactose: 'milk', eggs: 'egg', gluten: 'gluten', celiac: 'gluten', coeliac: 'gluten',
    soya: 'soy', seafood: 'shellfish', crustacean: 'shellfish', crustaceans: 'shellfish', mollusc: 'shellfish',
    sulfites: 'sulfite', sulphites: 'sulfite',
};

export type AllergenMatch = { allergen: string; ingredient: string; term: string };

export function parseAllergies(raw: string | null | undefined): string[] {
    return (raw || '')
        .split(/[,;\n]/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
}

function termsFor(allergy: string): string[] {
    const key = ALIASES[allergy] ?? allergy.replace(/ allergy$/, '');
    const base = SYNONYMS[key] ?? SYNONYMS[key.replace(/s$/, '')];
    return base ? Array.from(new Set([key, ...base])) : [key];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every ingredient line that looks like it contains one of the user's allergens. */
export function findAllergenMatches(ingredients: string[], allergies: string | null | undefined): AllergenMatch[] {
    const matches: AllergenMatch[] = [];
    for (const allergy of parseAllergies(allergies)) {
        const patterns = termsFor(allergy).map((term) => ({ term, re: new RegExp(`(^|[^a-z])${escape(term)}(es|s)?([^a-z]|$)`, 'i') }));
        for (const ingredient of ingredients) {
            if (/\b(peanut|nut|dairy|egg|gluten|soy)[- ]free\b/i.test(ingredient)) continue;
            const hit = patterns.find(({ re }) => re.test(ingredient));
            if (hit) matches.push({ allergen: allergy, ingredient, term: hit.term });
        }
    }
    return matches;
}

/** The hard-exclusion instruction added to every AI prompt when allergies are set. */
export function allergyInstruction(allergies: string | null | undefined): string {
    const list = parseAllergies(allergies);
    if (!list.length) return '';
    const expanded = list.map((a) => `${a} (including ${termsFor(a).slice(1, 8).join(', ') || a})`).join('; ');
    return `HARD RULE: The user is allergic to: ${expanded}. Never include these or any ingredient, sauce, broth, spice blend or product that commonly contains them, and never suggest them as optional. If a request can't be done without them, say so instead.`;
}
