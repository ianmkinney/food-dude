import { ASSISTANT_NAME, ASSISTANT_PRONUNCIATION, ASSISTANT_TAGLINE } from '../config/assistant';
import { groceryOperations, pantryOperations, recipeOperations, userOperations } from '../database/operations';
import { generateMultimodal, generateText, peekMultimodalVisionNote, stripCodeFences } from '../services/aiClient';
import type { PendingAttachment } from './chatAttachments';
import { prepareAttachmentPayload } from './chatAttachments';
import { isMutatingAction, summarizeActions } from './confirmActions';
import { loadThreadTurns, memoriesForPrompt } from '../chat/promptContext';
import { CHAT_THREAD_AMPI } from '../chat/chatThreads';
import { chatRecipesForPrompt, recipeEventsFromCards, recordChatRecipes } from '../chat/chatRecipes';
import { TOOL_SPEC, runTools, type SousCard, type ToolCall } from './tools';
import { getIncludeHealthData } from '../consent/consentStore';

// Provider-agnostic tool calling: the assistant answers with one JSON object holding a
// reply and the app actions to run. The same prompt works on Claude, GPT, Grok
// and Gemini (and later on platform AI), with no provider-specific tool APIs.

export type SousTurn = { role: 'user' | 'sous'; text: string; images?: { data: string; mimeType: string }[] };

export type SousResult = {
    reply: string;
    cards: SousCard[];
    /** Mutating tool calls waiting for the user to confirm in chat. */
    pendingActions?: ToolCall[];
    confirmSummary?: string;
    userRecipeImageUri?: string | null;
    visionNote?: string | null;
    /** Images to persist on the user message row for follow-up turns. */
    userChatImages?: { data: string; mimeType: string }[];
};

export const CRISIS_REPLY =
    "I'm only a cooking assistant and can't help with this. If you're in crisis or thinking about hurting yourself, call or text 988 (Suicide & Crisis Lifeline, US). If you or someone else is in danger or having a medical emergency or a severe allergic reaction, call 911 now.";

// Checked on the device before anything is sent, so the redirect is fixed and
// immediate rather than left to the model.
const CRISIS_PATTERN =
    /\b(suicid\w*|kill (myself|me)|end (my|it all)|self[- ]?harm|hurt(ing)? myself|cutting myself|overdos\w*|want to die|can'?t breathe|anaphyla\w*|throat (is )?(closing|swelling)|allergic reaction|epipen|being abused|abuse)\b/i;

export function isCrisisMessage(text: string): boolean {
    return CRISIS_PATTERN.test(text);
}

const today = () => new Date().toISOString().split('T')[0];

async function kitchenContext(userMessage: string): Promise<string> {
    const [recipes, pantry, grocery, user, includeHealth] = await Promise.all([
        recipeOperations.getAll().catch(() => []),
        pantryOperations.getAll().catch(() => []),
        groceryOperations.getAll().catch(() => []),
        userOperations.getCurrent().catch(() => null),
        getIncludeHealthData(),
    ]);
    const recipeLines = (recipes as { id: number; title: string }[])
        .slice(0, 40)
        .map((r) => `#${r.id} ${r.title}`)
        .join('; ');
    const pantryLines = (pantry as { name: string }[])
        .slice(0, 60)
        .map((p) => p.name)
        .join(', ');
    const groceryLines = (grocery as { name: string; is_checked?: number }[])
        .slice(0, 60)
        .map((g) => g.name)
        .join(', ');
    const flavor = (user as { flavor_preferences?: string } | null)?.flavor_preferences;
    const allergies = includeHealth ? (user as { allergies?: string } | null)?.allergies : null;
    const diet = includeHealth ? (user as { diet?: string } | null)?.diet : null;
    const memories = await memoriesForPrompt(userMessage);
    const chatRecipes = await chatRecipesForPrompt(CHAT_THREAD_AMPI).catch(() => '');
    return [
        `Today is ${today()}.`,
        `Saved recipes: ${recipeLines || 'none yet'}.`,
        chatRecipes
            ? `Recipes saved in this conversation (oldest first; the LAST one is what "it", "this recipe" or a follow-up answer refers to):\n${chatRecipes}`
            : '',
        `Pantry: ${pantryLines || 'empty'}.`,
        `Grocery list: ${groceryLines || 'empty'}.`,
        flavor ? `Flavor preferences: ${flavor}.` : '',
        allergies ? `Allergies (hard exclusion, never duplicate in memory — reference this field only): ${allergies}.` : '',
        diet ? `Diet needs: ${diet}.` : '',
        memories ? `Things you remember about this user:\n${memories}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}

function systemPrompt(context: string): string {
    return `You are ${ASSISTANT_NAME}, ${ASSISTANT_TAGLINE} inside the AmpliFood app. Your name is pronounced "${ASSISTANT_PRONUNCIATION}". You are an AI cooking tool, not a person, a friend, a doctor or a dietitian; never call yourself "Chef ${ASSISTANT_NAME}" or a kitchen companion; never claim or imply otherwise.
Be warm, quick and practical. Keep replies short (under 120 words) unless the user asks for a full meal plan, a full recipe, pairings, or a cost breakdown.
Scope: cooking, food, recipes, groceries, meal planning and how to use AmpliFood. Politely decline anything else and steer back to cooking.
Don't ask personal or emotional questions the user didn't raise. Never guilt the user, say you miss them, or nudge them to come back or use the app more.
If the user mentions self-harm, suicide, abuse, a medical emergency or a severe allergic reaction, reply only with: "${CRISIS_REPLY}" and no actions.
You can take real actions in the app with these tools:
${TOOL_SPEC}

Full meals & pairings:
- You CAN plan a complete meal (main, sides, salad, bread, dessert when asked) with wine, beer, cocktail, or non-alcoholic drink pairings. Suggest specific bottles or styles when helpful.
- When you mention alcoholic drinks, add a brief responsible-drinking note and that the listener must be 21+ (US) or legal drinking age where they live. Never encourage excess drinking.
- You CAN estimate grocery costs. Give a per-item breakdown and total in your reply, clearly labeled as an AI estimate that varies by store, brand, and region—not a quote. When the user wants items priced or added to the list, call add_to_grocery then estimate_cost so the app shows a tappable cost card.

Rules:
- Only call a tool when the user asked for that action or clearly agreed to it. Never invent recipe ids; use ids from the list below or a recipe_title.
- When you write new recipes the user wants to keep, call create_recipe for each dish (main and sides) instead of pasting full recipes in the reply. Every create_recipe must include per-serving nutrition estimates (calories, protein, carbohydrates, fat, fiber, sugar, sodium) and servings — these are AI estimates stored on the recipe. Then add_to_grocery for missing ingredients and estimate_cost when they want pricing.
- Only call create_recipe when the user asks for a new recipe or a new dish you wrote for them. Never use it to rename, tweak or "finalize" a recipe that is already saved; call update_recipe with that recipe's id instead.
- When the user is refining a recipe you just discussed (follow-up answers, "you choose", "make it spicier", "call it…"), stay on that exact recipe. Never invent a different dish.
- When the user asks to add, save, or import a recipe from images, a link, pasted text, or a PDF, you CAN see that content (including photos). Never say you cannot read images or attachments. Infer a sensible recipe title from the dish name in the photo, the page title, or the main ingredients — then call create_recipe or import_recipe immediately with that title. Do not ask what to name it; the user can rename later in the recipe book.
- When the user sends a recipe link (TikTok, Instagram, or a recipe website) or says to save/import a link, call import_recipe with that url immediately. Do not ask what to name it — use the post or page title. Keep the reply to one short sentence; the app shows the recipe card.
- If the user asks you to pick a name ("you choose", "you pick", "surprise me"), choose one that matches that recipe's actual ingredients and dish type (a soup stays a soup), then call update_recipe with the new title. If its current title already fits, say so and keep it.
- When the user attaches a photo, PDF, or recipe file, read it carefully. You can import it, answer questions, scale servings, convert units, or suggest allergy-safe substitutions in your reply. If they want it saved, call create_recipe or import_recipe in the same turn.
- For add_to_grocery, only list ingredients they still need; the app skips items already in the pantry.
- When the user wants items removed, checked off, or cleared from the grocery list (or bought and moved to pantry), call update_grocery_list with those item names — never only say you did it in "reply".
- When the user wants pantry items used up or removed, call add_to_pantry only to add stock; there is no remove-from-pantry tool yet — say what you cannot do instead of pretending.
- Never claim you added, removed, checked off, cleared, saved, imported, scheduled, updated, or priced anything unless the matching tool is in "actions" for this turn. The app shows cards from actions; a reply alone does not change data.
- Never use the user's allergens, or ingredients that commonly contain them, in anything you suggest or save.
- Mention allergens when they are obvious (nuts, shellfish, gluten, dairy, eggs). You are not a doctor or dietitian; don't give medical advice.
- Follow the food-safety rules above: give safe internal temperatures, no canning instructions of your own, no infant or pregnancy feeding guidance, and refuse non-food or unsafe items.
- Formatting: the app renders light Markdown in "reply" (**bold**, *italics*, short "- " or "1. " lists, links). Keep it light; no tables or HTML.
- Voice: replies may be read aloud by an expressive voice that understands audio tags in square brackets. Where it feels natural, add at most one or two per reply, right before the words they colour, for example [warmly], [excited], [laughs], [chuckles], [sighs], [whispers], [curious]. Most short replies need none. Never put tags inside tool args, recipe titles, ingredient lists, allergy or food-safety warnings, or the crisis reply. The app hides them on screen.
- Respond with ONLY one JSON object, no markdown fences: {"reply": string, "actions": [{"tool": string, "args": object}]}. Use "actions": [] when no action is needed. Never paste raw tool JSON in the reply; the app renders cards from actions.

${context}`;
}

function parseResponse(text: string): { reply: string; actions: ToolCall[] } {
    const cleaned = stripCodeFences(text).trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
        try {
            const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { reply?: unknown; actions?: unknown };
            const actions = Array.isArray(parsed.actions)
                ? (parsed.actions as ToolCall[]).filter((a) => a && typeof a.tool === 'string')
                : [];
            return { reply: typeof parsed.reply === 'string' ? parsed.reply : '', actions };
        } catch {
            // fall through: treat as plain text
        }
    }
    return { reply: cleaned, actions: [] };
}

const MAX_HISTORY = 12;

function recipeSaveIntent(message: string, hasAttachments: boolean): boolean {
    if (!message && !hasAttachments) return false;
    const m = String(message || '').toLowerCase();
    return (
        /\b(add|save|import|create|store)\b/.test(m) &&
        /\b(recipe|this|it|dish|card|photo|image|pdf)\b/.test(m)
    );
}

function shouldAutoApplyRecipeSave(message: string, attachments: PendingAttachment[], actions: ToolCall[]): boolean {
    if (!recipeSaveIntent(message, attachments.length > 0)) return false;
    return actions.some((a) => a.tool === 'create_recipe' || a.tool === 'import_recipe');
}

function buildApiTurns(
    merged: SousTurn[],
    message: string,
    currentImages: { data: string; mimeType: string }[]
): { role: 'user' | 'assistant'; text: string; images?: { data: string; mimeType: string }[] }[] {
    const turns: { role: 'user' | 'assistant'; text: string; images?: { data: string; mimeType: string }[] }[] = [];
    for (const turn of merged) {
        if (turn.role === 'sous') {
            turns.push({ role: 'assistant', text: turn.text });
        } else {
            turns.push({
                role: 'user',
                text: turn.text,
                images: turn.images?.length ? turn.images : undefined,
            });
        }
    }
    const last = turns[turns.length - 1];
    if (last?.role === 'user' && last.text === message && currentImages.length) {
        last.images = currentImages;
    } else {
        turns.push({
            role: 'user',
            text: message || 'Please use the attached images.',
            images: currentImages.length ? currentImages : undefined,
        });
    }
    return turns.slice(-MAX_HISTORY);
}

export async function askSous(
    history: SousTurn[],
    message: string,
    attachments: PendingAttachment[] = []
): Promise<SousResult> {
    if (isCrisisMessage(message)) {
        return { reply: CRISIS_REPLY, cards: [] };
    }

    let images: { data: string; mimeType: string }[] = [];
    let userRecipeImageUri: string | null = null;
    if (attachments.length) {
        const prepared = await prepareAttachmentPayload(attachments);
        images = prepared.images;
        userRecipeImageUri = prepared.attachments.find((a) => a.recipeImageUri)?.recipeImageUri || null;
    }

    const persisted = await loadThreadTurns(CHAT_THREAD_AMPI, MAX_HISTORY);
    const merged: SousTurn[] =
        persisted.history.length >= history.length
            ? persisted.history.map((t) => ({
                  role: t.role === 'assistant' ? 'sous' : t.role === 'sous' ? 'sous' : 'user',
                  text: t.text,
                  images: t.images,
              }))
            : history;
    const summaryBlock = persisted.summary ? `\nEarlier conversation summary:\n${persisted.summary}\n` : '';
    const context = await kitchenContext(message);
    const system = `${systemPrompt(context)}${summaryBlock}`;

    const anyImages =
        images.length > 0 || merged.some((t) => t.role === 'user' && (t.images?.length || 0) > 0);
    const apiTurns = buildApiTurns(merged, message, images);

    const raw = anyImages
        ? await generateMultimodal({
              system,
              turns: apiTurns,
              feature: 'chat',
              prompt: message,
              images,
              video: null,
          })
        : await generateText(
              `${system}\n\nConversation:\n${apiTurns.map((t) => `${t.role === 'user' ? 'User' : ASSISTANT_NAME}: ${t.text}`).join('\n')}`,
              { feature: 'chat' }
          );
    const visionNote = peekMultimodalVisionNote();
    const { reply, actions } = parseResponse(raw);

    const mutating = actions.filter(isMutatingAction);
    const immediate = actions.filter((a) => !isMutatingAction(a));
    let cards = immediate.length ? await runTools(immediate, { userRecipeImageUri }) : [];

    if (mutating.length && shouldAutoApplyRecipeSave(message, attachments, mutating)) {
        const saved = await runTools(mutating, { userRecipeImageUri });
        cards = [...cards, ...saved];
        await recordChatRecipes(CHAT_THREAD_AMPI, recipeEventsFromCards(saved)).catch(() => undefined);
        return {
            reply: visionNote ? `${visionNote}\n\n${reply || 'Saved to your recipe book.'}` : reply || 'Saved to your recipe book.',
            cards,
            userRecipeImageUri,
            visionNote,
            userChatImages: images.length ? images : undefined,
        };
    }

    if (mutating.length) {
        return {
            reply: reply || 'I can do that in AmpliFood — confirm below.',
            cards,
            pendingActions: mutating,
            confirmSummary: summarizeActions(mutating, await titlesForUpdates(mutating)),
            userRecipeImageUri,
            visionNote,
            userChatImages: images.length ? images : undefined,
        };
    }

    const replyText =
        visionNote && reply ? `${visionNote}\n\n${reply}` : reply || (cards.length ? 'Done.' : "Sorry, I didn't get that. Try asking another way?");

    return {
        reply: replyText,
        cards,
        userRecipeImageUri,
        visionNote,
        userChatImages: images.length ? images : undefined,
    };
}

async function titlesForUpdates(actions: ToolCall[]): Promise<Record<number, string>> {
    const titles: Record<number, string> = {};
    for (const action of actions) {
        if (action.tool !== 'update_recipe') continue;
        const id = Number(action.args.recipe_id);
        const recipe = (await recipeOperations.getById(id).catch(() => null)) as { title?: string } | null;
        if (recipe?.title) titles[id] = recipe.title;
    }
    return titles;
}

export async function confirmSousActions(
    actions: ToolCall[],
    userRecipeImageUri?: string | null
): Promise<SousCard[]> {
    const cards = await runTools(actions, { userRecipeImageUri });
    await recordChatRecipes(CHAT_THREAD_AMPI, recipeEventsFromCards(cards)).catch(() => undefined);
    return cards;
}
