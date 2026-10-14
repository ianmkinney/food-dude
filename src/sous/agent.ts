import { ASSISTANT_NAME, ASSISTANT_PRONUNCIATION, ASSISTANT_TAGLINE } from '../config/assistant';
import { groceryOperations, pantryOperations, recipeOperations, userOperations } from '../database/operations';
import { generateMultimodal, generateText, peekMultimodalVisionNote } from '../services/aiClient';
import { peekModelFallbackNote } from '../monetization/livePlatformAi';
import { parseAmpiResponse } from './parseAmpiResponse';
import type { PendingAttachment } from './chatAttachments';
import { prepareAttachmentPayload } from './chatAttachments';
import { isMutatingAction, summarizeActions } from './confirmActions';
import { loadThreadTurns, memoriesForPrompt } from '../chat/promptContext';
import { CHAT_THREAD_AMPI } from '../chat/chatThreads';
import {
    chatRecipesForPrompt,
    recentChatRecipeIds,
    recipeEventsFromCards,
    recordChatRecipes,
} from '../chat/chatRecipes';
import { AMPI_MULTI_RECIPE_RULE, AMPI_NO_CRISIS_SCRIPT_RULE } from '../../api/_lib/ampiActionSchema.js';
import { parseRecipeId, normalizeToolCalls } from '../../api/_lib/ampiToolNormalize.js';
import { recipeCountRetryNote, requestedNewRecipeCount } from '../../api/_lib/recipeRequestCount.js';
import { TOOL_SPEC, runTools, type SousCard, type ToolCall } from './tools';
import { getIncludeHealthData } from '../consent/consentStore';
import {
    CRISIS_ECHO_RETRY_NOTE,
    CRISIS_REPLY,
    isCrisisMessage,
    replacementForCrisisEcho,
    unwantedCrisisEcho,
} from '../safety/crisisIntent.js';

export { CRISIS_REPLY, isCrisisMessage };

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
    const pantryLines = (pantry as { name: string; freshness_pct?: number; amount_pct?: number }[])
        .slice(0, 60)
        .map((p) => {
            const fresh = p.freshness_pct != null ? `freshness ${p.freshness_pct}%` : '';
            const amt = p.amount_pct != null ? `amount ${p.amount_pct}%` : '';
            const extra = [fresh, amt].filter(Boolean).join(', ');
            return extra ? `${p.name} (${extra})` : p.name;
        })
        .join('; ');
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
        `Pantry (freshness/amount are 0–100% estimates; suggest using low-freshness or low-amount items first): ${pantryLines || 'empty'}.`,
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
${AMPI_NO_CRISIS_SCRIPT_RULE}
You can take real actions in the app with these tools:
${TOOL_SPEC}

Full meals & pairings:
- You CAN plan a complete meal (main, sides, salad, bread, dessert when asked) with wine, beer, cocktail, or non-alcoholic drink pairings. Suggest specific bottles or styles when helpful.
- When you mention alcoholic drinks, add a brief responsible-drinking note and that the listener must be 21+ (US) or legal drinking age where they live. Never encourage excess drinking.
- You CAN estimate grocery costs. Give a per-item breakdown and total in your reply, clearly labeled as an AI estimate that varies by store, brand, and region—not a quote. When the user wants items priced or added to the list, call add_to_grocery then estimate_cost so the app shows a tappable cost card.

Rules:
- Only call a tool when the user asked for that action or clearly agreed to it. Never invent recipe ids; use ids from the list below or a recipe_title.
- When you write new recipes the user wants to keep, call create_recipe for each dish (main and sides) instead of pasting full recipes in the reply. Every create_recipe must include per-serving nutrition estimates (calories, protein, carbohydrates, fat, fiber, sugar, sodium) and servings — these are AI estimates stored on the recipe. Then add_to_grocery for missing ingredients and estimate_cost when they want pricing.
- ${AMPI_MULTI_RECIPE_RULE}
- Only call create_recipe when the user asks for a new recipe or a new dish you wrote for them. Never use it to rename, tweak or "finalize" a recipe that is already saved; call update_recipe with that recipe's id instead.
- When the user is refining a recipe you just discussed (follow-up answers, "you choose", "make it spicier", "call it…"), stay on that exact recipe. Never invent a different dish for a tweak. A request for other dishes or a count of recipes ("2 different ones", "make me 3 dinner recipes") is a command to write those new recipes now, not a tweak.
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
- Voice: replies may be read aloud by an expressive voice that understands audio tags in square brackets. Where it feels natural, add at most one or two per reply, right before the words they colour, for example [warmly], [excited], [laughs], [chuckles], [sighs], [whispers], [curious]. Most short replies need none. Never put tags inside tool args, recipe titles, ingredient lists, or allergy or food-safety warnings. The app hides them on screen.
- Respond with ONLY one JSON object, no markdown fences: {"reply": string, "actions": [{"tool": string, "args": object}]}. Use "actions": [] when no action is needed. Never paste raw tool JSON in the reply; the app renders cards from actions.

${context}`;
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
    const writesRecipe = actions.some((a) => a.tool === 'create_recipe' || a.tool === 'import_recipe');
    if (!writesRecipe) return false;
    if (recipeSaveIntent(message, attachments.length > 0)) return true;
    const wanted = requestedNewRecipeCount(message);
    return wanted != null && wanted >= 2;
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

function replyEchoesCrisis(message: string, raw: string, reply: string): boolean {
    return unwantedCrisisEcho(message, reply) || unwantedCrisisEcho(message, raw);
}

async function completeSousModel(
    system: string,
    message: string,
    apiTurns: { role: 'user' | 'assistant'; text: string; images?: { data: string; mimeType: string }[] }[],
    images: { data: string; mimeType: string }[],
    anyImages: boolean,
    extraNote?: string
): Promise<string> {
    const noted = extraNote ? `${system}\n\n${extraNote}` : system;
    if (anyImages) {
        return generateMultimodal({
            system: noted,
            turns: apiTurns,
            feature: 'chat',
            prompt: message,
            images,
            video: null,
        });
    }
    return generateText(
        `${noted}\n\nConversation:\n${apiTurns.map((t) => `${t.role === 'user' ? 'User' : ASSISTANT_NAME}: ${t.text}`).join('\n')}`,
        { feature: 'chat' }
    );
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
                  text:
                      t.role === 'assistant' || t.role === 'sous'
                          ? parseAmpiResponse(t.text).reply || t.text
                          : t.text,
                  images: t.images,
              }))
            : history;
    const summaryBlock = persisted.summary ? `\nEarlier conversation summary:\n${persisted.summary}\n` : '';
    const context = await kitchenContext(message);
    const system = `${systemPrompt(context)}${summaryBlock}`;

    const anyImages =
        images.length > 0 || merged.some((t) => t.role === 'user' && (t.images?.length || 0) > 0);
    const apiTurns = buildApiTurns(merged, message, images);

    let raw = await completeSousModel(system, message, apiTurns, images, anyImages);
    let parsed = parseAmpiResponse(raw);
    if (replyEchoesCrisis(message, raw, parsed.reply)) {
        raw = await completeSousModel(system, message, apiTurns, images, anyImages, CRISIS_ECHO_RETRY_NOTE);
        parsed = parseAmpiResponse(raw);
        if (replyEchoesCrisis(message, raw, parsed.reply)) {
            parsed = { reply: replacementForCrisisEcho(parsed.actions), actions: parsed.actions, parsed: true };
        }
    }
    const wantedRecipes = requestedNewRecipeCount(message);
    const created = parsed.actions.filter((action) => action.tool === 'create_recipe');
    if (wantedRecipes != null && wantedRecipes >= 2 && created.length < wantedRecipes) {
        raw = await completeSousModel(
            system,
            message,
            apiTurns,
            images,
            anyImages,
            recipeCountRetryNote(wantedRecipes, created.length)
        );
        const again = parseAmpiResponse(raw);
        const againCreated = again.actions.filter((action) => action.tool === 'create_recipe');
        if (!replyEchoesCrisis(message, raw, again.reply) && againCreated.length >= created.length) {
            parsed = again;
        }
    }
    const { reply, actions } = parsed;
    const visionNote = peekMultimodalVisionNote();
    const modelFallbackNote = peekModelFallbackNote();
    const recentRecipeIds = await recentChatRecipeIds(CHAT_THREAD_AMPI).catch(() => []);
    const toolOptions = { userRecipeImageUri, recentRecipeIds, reply };

    const prefixNotes = [visionNote, modelFallbackNote].filter(Boolean).join('\n\n');
    const withNotes = (text: string) => (prefixNotes && text ? `${prefixNotes}\n\n${text}` : prefixNotes || text);

    const mutating = actions.filter(isMutatingAction);
    const immediate = actions.filter((a) => !isMutatingAction(a));
    let cards = immediate.length ? await runTools(immediate, toolOptions) : [];

    if (mutating.length && shouldAutoApplyRecipeSave(message, attachments, mutating)) {
        const saved = await runTools(mutating, toolOptions);
        cards = [...cards, ...saved];
        await recordChatRecipes(CHAT_THREAD_AMPI, recipeEventsFromCards(saved)).catch(() => undefined);
        return {
            reply: withNotes(reply || 'Saved to your recipe book.'),
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

    const replyText = withNotes(reply || (cards.length ? 'Done.' : "Sorry, I didn't get that. Try asking another way?"));

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
    const recentRecipeIds = await recentChatRecipeIds(CHAT_THREAD_AMPI).catch(() => []);
    const normalized = normalizeToolCalls(actions, { recentRecipeIds }) as ToolCall[];
    for (const action of normalized) {
        if (action.tool !== 'update_recipe') continue;
        let id = parseRecipeId(action.args.recipe_id);
        let recipe = id ? ((await recipeOperations.getById(id).catch(() => null)) as { id: number; title?: string } | null) : null;
        if (!recipe && action.args.recipe_title) {
            const matches = (await recipeOperations.search(String(action.args.recipe_title)).catch(() => [])) as {
                id: number;
                title?: string;
            }[];
            recipe = matches[0] ?? null;
            id = recipe?.id ?? id;
        }
        if (!recipe && recentRecipeIds[0]) {
            recipe = (await recipeOperations.getById(recentRecipeIds[0]).catch(() => null)) as {
                id: number;
                title?: string;
            } | null;
            id = recipe?.id ?? id;
        }
        if (recipe?.title && id) titles[id] = recipe.title;
    }
    return titles;
}

export async function confirmSousActions(
    actions: ToolCall[],
    userRecipeImageUri?: string | null
): Promise<SousCard[]> {
    const recentRecipeIds = await recentChatRecipeIds(CHAT_THREAD_AMPI).catch(() => []);
    const cards = await runTools(actions, { userRecipeImageUri, recentRecipeIds });
    await recordChatRecipes(CHAT_THREAD_AMPI, recipeEventsFromCards(cards)).catch(() => undefined);
    return cards;
}
