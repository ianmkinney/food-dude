import { coerceRecipeTemplateFromToolArgs } from './recipeNormalize.js';
import { resolveRecipeTitleForSave } from './recipeTitle.js';

const PARTY_RECIPE_TOOLS = new Set(['create_recipe', 'import_recipe']);

/**
 * @param {string} reply
 * @param {{ tool: string, args?: object }[]} actions
 */
export function synthesizePartyAmpiReplyText(reply, actions = []) {
    const text = String(reply || '').trim();
    if (text) return text;
    if (!Array.isArray(actions) || !actions.length) {
        return '';
    }
    const create = actions.find((a) => a?.tool === 'create_recipe');
    if (create?.args) {
        const title = resolveRecipeTitleForSave(create.args) || create.args.title || 'this dish';
        return `Here's a ${title} idea for the party.`;
    }
    const imp = actions.find((a) => a?.tool === 'import_recipe');
    if (imp?.args?.url) {
        return 'I found a recipe from that link for the group.';
    }
    if (actions.some((a) => a?.tool === 'add_to_grocery' || a?.tool === 'add_to_pantry')) {
        return 'I updated the shopping list for the party.';
    }
    return 'Here is what I suggest for the group — see the recipe card below.';
}

/**
 * Draft recipe cards for party chat (not saved until the user taps a button).
 * @param {{ tool: string, args?: object }[]} actions
 */
export function buildPartyAmpiDraftCards(actions = []) {
    const cards = [];
    for (const action of actions || []) {
        if (!action || !PARTY_RECIPE_TOOLS.has(action.tool)) continue;
        if (action.tool === 'create_recipe') {
            const template = coerceRecipeTemplateFromToolArgs(action.args || {});
            const title = resolveRecipeTitleForSave({ ...action.args, ...template });
            if (!title) continue;
            cards.push({
                type: 'recipe_draft',
                title,
                description: template.description,
                servings: template.servings,
                ingredients: template.ingredients.map((ing) => ({
                    ingredient: ing.name,
                    quantity: ing.quantity,
                    unit: ing.unit,
                })),
                instructions: template.steps,
                pendingAction: { tool: 'create_recipe', args: action.args },
            });
        }
        if (action.tool === 'import_recipe') {
            cards.push({
                type: 'import_draft',
                pendingAction: { tool: 'import_recipe', args: action.args },
            });
        }
    }
    return cards;
}

export function partyAmpiShouldAutoAddToMeals(prompt) {
    const p = String(prompt || '').toLowerCase();
    return (
        /\b(add to (the )?party|party meal|our meal|for tonight|for the party|group dinner)\b/.test(p) ||
        /\b(put it on|add it to) (the )?menu\b/.test(p)
    );
}

export function partyAmpiAttachmentFromTurn({ cards, pendingActions, failed }) {
    if (!cards?.length && !pendingActions?.length && !failed) return null;
    return {
        ampi: {
            cards: cards || [],
            pendingActions: pendingActions || [],
            failed: Boolean(failed),
        },
    };
}

export function attachmentHasPartyPayload(attachment) {
    if (!attachment || typeof attachment !== 'object') return false;
    if (attachment.fileName) return true;
    const cards = attachment.ampi?.cards;
    return Array.isArray(cards) && cards.length > 0;
}
