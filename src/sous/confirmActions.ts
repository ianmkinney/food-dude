import type { ToolCall } from './tools';

const MUTATING = new Set([
    'import_recipe',
    'create_recipe',
    'add_to_meal_plan',
    'add_to_pantry',
    'add_to_grocery',
]);

export function isMutatingAction(call: ToolCall): boolean {
    return MUTATING.has(call.tool);
}

export function summarizeActions(calls: ToolCall[]): string {
    const lines = calls.filter(isMutatingAction).map((call) => {
        switch (call.tool) {
            case 'import_recipe':
                return 'Import a recipe into your recipe book';
            case 'create_recipe':
                return `Save recipe “${call.args.title}”`;
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
