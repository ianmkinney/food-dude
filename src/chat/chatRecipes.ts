import { chatOperations, recipeOperations } from '../database/operations';

// Recipes imported, created or edited in a chat thread. They are stored as
// meta on chat rows so they survive a reload and go away with the thread, and
// each prompt re-reads the recipe itself so renames and edits show up.

export type ChatRecipeAction = 'imported' | 'created' | 'updated';
export type ChatRecipeEvent = { id: number; title: string; action: ChatRecipeAction };

const SCAN_LIMIT = 80;
const MAX_IN_PROMPT = 6;
const MAX_INGREDIENTS = 10;

const DESCRIBE: Record<ChatRecipeAction, (title: string) => string> = {
    imported: (title) => `Imported “${title}” into your recipe book.`,
    created: (title) => `Saved “${title}” to your recipe book.`,
    updated: (title) => `Updated “${title}” in your recipe book.`,
};

type RecipeCardLike = { type: string; recipe?: { id: number; title: string }; savedAs?: ChatRecipeAction };

export function recipeEventsFromCards(cards: RecipeCardLike[]): ChatRecipeEvent[] {
    return cards
        .filter((card) => card.type === 'recipe' && card.recipe && card.savedAs)
        .map((card) => ({ id: Number(card.recipe!.id), title: card.recipe!.title, action: card.savedAs! }));
}

export function describeChatRecipes(events: ChatRecipeEvent[]): string {
    return events.map((e) => DESCRIBE[e.action](e.title)).join(' ');
}

export async function recordChatRecipes(threadId: string, events: ChatRecipeEvent[]) {
    if (!events.length) return;
    await chatOperations.addMessage(threadId, {
        role: 'sous',
        text: describeChatRecipes(events),
        meta: { recipes: events },
    });
}

function eventsFromRow(row: { meta_json?: string | null }): ChatRecipeEvent[] {
    if (!row.meta_json) return [];
    try {
        const meta = JSON.parse(row.meta_json) as { recipes?: unknown };
        return Array.isArray(meta.recipes)
            ? (meta.recipes as ChatRecipeEvent[]).filter((e) => e && Number.isFinite(Number(e.id)))
            : [];
    } catch {
        return [];
    }
}

/** One line per recipe from this thread, oldest first; the last line is the one follow-ups refer to. */
export async function chatRecipesForPrompt(threadId: string): Promise<string> {
    const rows = (await chatOperations.getRecent(threadId, SCAN_LIMIT)) as { meta_json?: string | null }[];
    const seen = new Map<number, { origin: ChatRecipeAction; edited: boolean }>();
    for (const row of rows) {
        for (const event of eventsFromRow(row)) {
            const id = Number(event.id);
            const prior = seen.get(id);
            seen.delete(id);
            seen.set(id, {
                origin: prior?.origin ?? event.action,
                edited: Boolean(prior?.edited) || (Boolean(prior) && event.action === 'updated'),
            });
        }
    }
    const lines: string[] = [];
    for (const [id, info] of [...seen.entries()].slice(-MAX_IN_PROMPT)) {
        const recipe = (await recipeOperations.getById(id).catch(() => null)) as {
            title: string;
            ingredients?: { ingredient?: string }[];
        } | null;
        if (!recipe) continue;
        const ingredients = (recipe.ingredients || [])
            .map((ing) => ing.ingredient?.trim())
            .filter(Boolean)
            .slice(0, MAX_INGREDIENTS)
            .join(', ');
        const how = info.edited ? `${info.origin}, then edited` : info.origin;
        lines.push(`- #${id} “${recipe.title}” (${how} in this chat; key ingredients: ${ingredients || 'none listed'})`);
    }
    return lines.join('\n');
}
