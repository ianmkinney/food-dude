/**
 * Normalize model tool JSON across providers (Claude, Gemini, GPT, etc.).
 */

/** @param {unknown} value */
export function parseRecipeId(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
    const s = String(value).trim();
    if (!s || s === '?' || s === '#?') return null;
    const hash = s.match(/^#(\d+)$/);
    if (hash) return Number(hash[1]);
    const labeled = s.match(/^(?:recipe\s*)?#?(\d+)$/i);
    if (labeled) return Number(labeled[1]);
    if (/^\d+$/.test(s)) return Number(s);
    const embedded = s.match(/#(\d+)/);
    if (embedded) return Number(embedded[1]);
    return null;
}

/** @param {string} reply */
export function parseRecipeIdFromReply(reply) {
    const text = String(reply || '');
    const paren = text.match(/\(#(\d+)\)/);
    if (paren) return Number(paren[1]);
    const tail = text.match(/#(\d+)\s*[.…]?\s*$/);
    if (tail) return Number(tail[1]);
    const any = text.match(/#(\d+)\b/);
    return any ? Number(any[1]) : null;
}

/**
 * @param {unknown[]} actions
 * @param {{ reply?: string, recentRecipeIds?: number[] }} [context]
 */
export function normalizeToolCalls(actions, context = {}) {
    if (!Array.isArray(actions)) return [];
    const replyId = parseRecipeIdFromReply(context.reply);
    const recent = Array.isArray(context.recentRecipeIds) ? context.recentRecipeIds : [];

    return actions
        .filter((a) => a && typeof a.tool === 'string')
        .map((raw) => {
            const tool = String(raw.tool).trim();
            const args =
                raw.args && typeof raw.args === 'object' && !Array.isArray(raw.args)
                    ? { ...raw.args }
                    : {};

            if (tool === 'update_recipe' || tool === 'add_to_meal_plan') {
                let id = parseRecipeId(args.recipe_id ?? args.recipeId ?? args.id ?? args.recipe);
                if (id == null && replyId != null) id = replyId;
                if (id == null && recent.length) id = recent[0];
                if (id != null) args.recipe_id = id;

                const title =
                    args.recipe_title ??
                    args.recipeTitle ??
                    args.target_title ??
                    (tool === 'update_recipe' && typeof args.name === 'string' ? args.name : null);
                if (title && !args.recipe_title) args.recipe_title = String(title).trim();

                delete args.recipeId;
                delete args.id;
            }

            if (tool === 'update_recipe') {
                if (args.prepTime != null && args.prep_time == null) args.prep_time = args.prepTime;
                if (args.cookTime != null && args.cook_time == null) args.cook_time = args.cookTime;
                if (args.instructions == null && Array.isArray(args.steps)) args.instructions = args.steps;
            }

            return { tool, args };
        });
}
