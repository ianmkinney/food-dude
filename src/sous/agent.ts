import { ASSISTANT_NAME, ASSISTANT_PRONUNCIATION, ASSISTANT_TAGLINE } from '../config/assistant';
import { pantryOperations, recipeOperations, userOperations } from '../database/operations';
import { generateMultimodal, generateText, stripCodeFences } from '../services/aiClient';
import type { PendingAttachment } from './chatAttachments';
import { prepareAttachmentPayload } from './chatAttachments';
import { isMutatingAction, summarizeActions } from './confirmActions';
import { loadThreadTurns, memoriesForPrompt } from '../chat/promptContext';
import { CHAT_THREAD_AMPI } from '../chat/chatThreads';
import { TOOL_SPEC, runTools, type SousCard, type ToolCall } from './tools';
import { getIncludeHealthData } from '../consent/consentStore';

// Provider-agnostic tool calling: the assistant answers with one JSON object holding a
// reply and the app actions to run. The same prompt works on Claude, GPT, Grok
// and Gemini (and later on platform AI), with no provider-specific tool APIs.

export type SousTurn = { role: 'user' | 'sous'; text: string };

export type SousResult = {
    reply: string;
    cards: SousCard[];
    /** Mutating tool calls waiting for the user to confirm in chat. */
    pendingActions?: ToolCall[];
    confirmSummary?: string;
    userRecipeImageUri?: string | null;
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
    const [recipes, pantry, user, includeHealth] = await Promise.all([
        recipeOperations.getAll().catch(() => []),
        pantryOperations.getAll().catch(() => []),
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
    const flavor = (user as { flavor_preferences?: string } | null)?.flavor_preferences;
    const allergies = includeHealth ? (user as { allergies?: string } | null)?.allergies : null;
    const diet = includeHealth ? (user as { diet?: string } | null)?.diet : null;
    const memories = await memoriesForPrompt(userMessage);
    return [
        `Today is ${today()}.`,
        `Saved recipes: ${recipeLines || 'none yet'}.`,
        `Pantry: ${pantryLines || 'empty'}.`,
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
- When you write new recipes the user wants to keep, call create_recipe for each dish (main and sides) instead of pasting full recipes in the reply. Then add_to_grocery for missing ingredients and estimate_cost when they want pricing.
- When the user attaches a photo, PDF, or recipe file, read it carefully. You can import it, answer questions, scale servings, convert units, or suggest allergy-safe substitutions in your reply. Only call tools when saving data to the app.
- For add_to_grocery, only list ingredients they still need; the app skips items already in the pantry.
- Never use the user's allergens, or ingredients that commonly contain them, in anything you suggest or save.
- Mention allergens when they are obvious (nuts, shellfish, gluten, dairy, eggs). You are not a doctor or dietitian; don't give medical advice.
- Follow the food-safety rules above: give safe internal temperatures, no canning instructions of your own, no infant or pregnancy feeding guidance, and refuse non-food or unsafe items.
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

export async function askSous(
    history: SousTurn[],
    message: string,
    attachments: PendingAttachment[] = []
): Promise<SousResult> {
    if (isCrisisMessage(message)) {
        return { reply: CRISIS_REPLY, cards: [] };
    }

    let attachmentBlock = '';
    let images: { data: string; mimeType: string }[] = [];
    let userRecipeImageUri: string | null = null;
    if (attachments.length) {
        const prepared = await prepareAttachmentPayload(attachments);
        attachmentBlock = prepared.promptExtra;
        images = prepared.images;
        userRecipeImageUri = prepared.attachments.find((a) => a.recipeImageUri)?.recipeImageUri || null;
    }

    const persisted = await loadThreadTurns(CHAT_THREAD_AMPI, MAX_HISTORY);
    const merged =
        persisted.history.length >= history.length
            ? persisted.history.map((t) => ({ role: t.role === 'assistant' ? 'sous' : t.role, text: t.text }))
            : history;
    const transcript = merged
        .slice(-MAX_HISTORY)
        .map((turn) => `${turn.role === 'user' ? 'User' : ASSISTANT_NAME}: ${turn.text}`)
        .join('\n');
    const summaryBlock = persisted.summary ? `\nEarlier conversation summary:\n${persisted.summary}\n` : '';
    const prompt = `${systemPrompt(await kitchenContext(message))}
${summaryBlock}
Conversation so far:
${transcript || '(new conversation)'}
User: ${message}${attachmentBlock}`;

    const raw = images.length
        ? await generateMultimodal({ prompt, images, video: null, feature: 'chat' })
        : await generateText(prompt, { feature: 'chat' });
    const { reply, actions } = parseResponse(raw);

    const mutating = actions.filter(isMutatingAction);
    const immediate = actions.filter((a) => !isMutatingAction(a));
    const cards = immediate.length ? await runTools(immediate, { userRecipeImageUri }) : [];

    if (mutating.length) {
        return {
            reply: reply || 'I can do that in AmpliFood — confirm below.',
            cards,
            pendingActions: mutating,
            confirmSummary: summarizeActions(mutating),
            userRecipeImageUri,
        };
    }

    return {
        reply: reply || (cards.length ? 'Done.' : "Sorry, I didn't get that. Try asking another way?"),
        cards,
        userRecipeImageUri,
    };
}

export async function confirmSousActions(
    actions: ToolCall[],
    userRecipeImageUri?: string | null
): Promise<SousCard[]> {
    return runTools(actions, { userRecipeImageUri });
}
