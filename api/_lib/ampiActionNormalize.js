import { coerceRecipeTemplateFromToolArgs } from './recipeNormalize.js';
import { normalizeToolCalls, parseRecipeId } from './ampiToolNormalize.js';
import { AMPI_TOOL_NAMES } from './ampiActionSchema.js';

const MEMORY_CATEGORIES = new Set(['likes', 'dislikes', 'household', 'equipment', 'skill', 'goals']);
const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner']);

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {{ tool: string, args: object }} action
 * @returns {string[]}
 */
export function validateCanonicalAction(action) {
    const errors = [];
    const tool = String(action?.tool || '').trim();
    const args = action?.args && typeof action.args === 'object' ? action.args : {};

    if (!AMPI_TOOL_NAMES.includes(tool)) {
        errors.push(`unknown tool "${tool}"`);
        return errors;
    }

    switch (tool) {
        case 'find_recipes':
            if (!hasText(args.query)) errors.push('find_recipes requires query');
            break;
        case 'import_recipe':
            if (!hasText(args.url) && !hasText(args.text)) errors.push('import_recipe requires url or text');
            break;
        case 'create_recipe': {
            const t = coerceRecipeTemplateFromToolArgs(args);
            if (!hasText(t.title) || t.title === 'Untitled recipe') errors.push('create_recipe requires title');
            if (!t.ingredients?.length) errors.push('create_recipe requires ingredients');
            if (!t.steps?.length) errors.push('create_recipe requires instructions/steps');
            break;
        }
        case 'update_recipe': {
            const id = parseRecipeId(args.recipe_id ?? args.recipeId ?? args.id);
            const title = args.recipe_title ?? args.recipeTitle ?? args.title;
            if (id == null && !hasText(title)) {
                errors.push('update_recipe requires recipe_id or recipe_title');
            }
            coerceRecipeTemplateFromToolArgs(args);
            break;
        }
        case 'add_to_meal_plan':
            if (!hasText(args.date)) errors.push('add_to_meal_plan requires date');
            if (!MEAL_TYPES.has(String(args.meal_type || '').toLowerCase())) {
                errors.push('add_to_meal_plan requires meal_type breakfast|lunch|dinner');
            }
            break;
        case 'add_to_pantry':
        case 'add_to_grocery':
            if (!Array.isArray(args.items) || !args.items.length) errors.push(`${tool} requires items[]`);
            break;
        case 'update_grocery_list':
            if (!Array.isArray(args.remove) || !args.remove.length) errors.push('update_grocery_list requires remove[]');
            break;
        case 'remember_fact':
            if (!hasText(args.fact)) errors.push('remember_fact requires fact');
            if (!MEMORY_CATEGORIES.has(String(args.category || ''))) errors.push('remember_fact invalid category');
            break;
        default:
            break;
    }
    return errors;
}

/**
 * @param {{ reply?: string, actions?: { tool: string, args?: object }[] }} extracted
 * @param {{ reply?: string, recentRecipeIds?: number[] }} [context]
 */
export function normalizeCanonicalAmpiTurn({ reply, actions }, context = {}) {
    const normalized = normalizeToolCalls(actions, {
        reply: context.reply ?? reply,
        recentRecipeIds: context.recentRecipeIds,
    });
    const errors = [];
    for (const action of normalized) {
        errors.push(...validateCanonicalAction(action).map((e) => `${action.tool}: ${e}`));
    }
    const replyText = typeof reply === 'string' ? reply.trim() : '';
    return {
        reply: replyText,
        actions: normalized,
        valid: errors.length === 0,
        errors,
        parsed: normalized.length > 0 || replyText.length > 0,
    };
}

export function serializeCanonicalAmpiTurn(turn) {
    return JSON.stringify({
        reply: turn.reply || '',
        actions: turn.actions || [],
    });
}
