import type { ToolCall } from './tools';

const MUTATING = new Set([
    'import_recipe',
    'create_recipe',
    'update_recipe',
    'add_to_meal_plan',
    'add_to_pantry',
    'add_to_grocery',
]);

export function isMutatingAction(call: ToolCall): boolean {
    return MUTATING.has(call.tool);
}

/** `recipeTitles` maps recipe ids to their current titles so edits name the recipe they change. */
export function summarizeActions(calls: ToolCall[], recipeTitles: Record<number, string> = {}): string {
    const lines = calls.filter(isMutatingAction).map((call) => {
        switch (call.tool) {
            case 'import_recipe':
                return 'Import a recipe into your recipe book';
            case 'create_recipe':
                return `Save a new recipe “${call.args.title}”`;
            case 'update_recipe': {
                const { title, recipe_id, ...rest } = call.args;
                const current = recipeTitles[Number(recipe_id)];
                const target = current ? `“${current}”` : `recipe #${recipe_id}`;
                const otherChanges = Object.values(rest).some((v) => v != null);
                if (title && !otherChanges) return `Rename ${target} to “${title}”`;
                return title ? `Update ${target} and rename it “${title}”` : `Update ${target}`;
            }
            case 'add_to_meal_plan':
                return `Schedule ${call.args.recipe_title || `recipe #${call.args.recipe_id}`} on ${call.args.date} (${call.args.meal_type})`;
            case 'add_to_pantry':
                return `Add ${call.args.items?.length || 0} item(s) to pantry`;
            case 'add_to_grocery':
                return `Add ${call.args.items?.length || 0} item(s) to grocery list`;
            default:
                return call.tool;
        }
    });
    return lines.length ? lines.map((l) => `• ${l}`).join('\n') : 'Apply changes in AmpliFood';
}
