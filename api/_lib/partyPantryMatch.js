import { normalizePantrySnapshotItems } from './partyPantryShare.js';

export function normalizeIngredientToken(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @param {string} ingredientName
 * @param {{ memberId: string, displayName: string, items: object[] }[]} pantryByMember
 */
export function holdersForIngredient(ingredientName, pantryByMember) {
    const token = normalizeIngredientToken(ingredientName);
    if (!token) return [];
    const holders = [];
    for (const member of pantryByMember || []) {
        for (const item of member.items || []) {
            const iname = normalizeIngredientToken(item.name);
            if (!iname) continue;
            const match =
                iname === token ||
                iname.includes(token) ||
                token.includes(iname) ||
                token.split(' ').some((w) => w.length > 2 && iname.includes(w));
            if (match) {
                holders.push({
                    memberId: member.memberId,
                    displayName: member.displayName,
                    pantryItemName: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    amountPct: item.amountPct,
                    freshnessPct: item.freshnessPct,
                    expirationDate: item.expirationDate,
                });
                break;
            }
        }
    }
    return holders;
}

/**
 * @param {object} draftCard recipe_draft card
 * @param {{ memberId: string, displayName: string, items: object[] }[]} pantryByMember
 */
export function enrichRecipeDraftWithPantry(draftCard, pantryByMember) {
    if (!draftCard || draftCard.type !== 'recipe_draft') return draftCard;
    const ingredients = draftCard.ingredients || [];
    const pantryLines = [];
    const missingIngredients = [];
    for (const ing of ingredients) {
        const name = ing.ingredient || ing.name || '';
        const holders = holdersForIngredient(name, pantryByMember);
        pantryLines.push({ ingredient: name, holders });
        if (!holders.length) missingIngredients.push(name);
    }
    return {
        ...draftCard,
        pantryLines,
        missingIngredients,
    };
}

export function buildPantryByMemberFromMembersList(members) {
    return (members || [])
        .filter((m) => m.pantryShareEnabled && Array.isArray(m.pantrySnapshot))
        .map((m) => ({
            memberId: m.memberId,
            displayName: m.displayName || 'Member',
            items: normalizePantrySnapshotItems(m.pantrySnapshot),
        }))
        .filter((m) => m.items.length);
}
