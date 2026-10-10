import { ASSISTANT_NAME, ASSISTANT_PRONUNCIATION, ASSISTANT_TAGLINE } from '../config/assistant';
import { pantryOperations, recipeOperations, userOperations } from '../database/operations';
import { generateText, stripCodeFences } from '../services/aiClient';
import { TOOL_SPEC, runTools, type SousCard, type ToolCall } from './tools';
import { getIncludeHealthData } from '../consent/consentStore';

// Provider-agnostic tool calling: the assistant answers with one JSON object holding a
// reply and the app actions to run. The same prompt works on Claude, GPT, Grok
// and Gemini (and later on platform AI), with no provider-specific tool APIs.

export type SousTurn = { role: 'user' | 'sous'; text: string };

export type SousResult = { reply: string; cards: SousCard[] };

const MAX_HISTORY = 12;

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

async function kitchenContext(): Promise<string> {
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
    return [
        `Today is ${today()}.`,
        `Saved recipes: ${recipeLines || 'none yet'}.`,
        `Pantry: ${pantryLines || 'empty'}.`,
        flavor ? `Flavor preferences: ${flavor}.` : '',
        allergies ? `Allergies (hard exclusion, never include): ${allergies}.` : '',
        diet ? `Diet needs: ${diet}.` : '',
    ]
        .filter(Boolean)
        .join('\n');
}

function systemPrompt(context: string): string {
    return `You are ${ASSISTANT_NAME}, ${ASSISTANT_TAGLINE} inside the AmpliFood app. Your name is pronounced "${ASSISTANT_PRONUNCIATION}". You are an AI cooking tool, not a person, a friend, a doctor or a dietitian; never claim or imply otherwise.
Be warm, quick and practical. Keep replies short (under 120 words) unless asked for a full recipe.
Scope: cooking, food, recipes, groceries, meal planning and how to use AmpliFood. Politely decline anything else and steer back to cooking.
Don't ask personal or emotional questions the user didn't raise. Never guilt the user, say you miss them, or nudge them to come back or use the app more.
If the user mentions self-harm, suicide, abuse, a medical emergency or a severe allergic reaction, reply only with: "${CRISIS_REPLY}" and no actions.
You can take real actions in the app with these tools:
${TOOL_SPEC}

Rules:
- Only call a tool when the user asked for that action or clearly agreed to it. Never invent recipe ids; use ids from the list below or a recipe_title.
- When you write a new recipe the user wants to keep, call create_recipe instead of pasting the whole recipe in the reply.
- Never use the user's allergens, or ingredients that commonly contain them, in anything you suggest or save.
- Mention allergens when they are obvious (nuts, shellfish, gluten, dairy, eggs). You are not a doctor or dietitian; don't give medical advice.
- Follow the food-safety rules above: give safe internal temperatures, no canning instructions of your own, no infant or pregnancy feeding guidance, and refuse non-food or unsafe items.
- Respond with ONLY one JSON object, no markdown fences: {"reply": string, "actions": [{"tool": string, "args": object}]}. Use "actions": [] when no action is needed.

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

export async function askSous(history: SousTurn[], message: string): Promise<SousResult> {
    if (isCrisisMessage(message)) {
        return { reply: CRISIS_REPLY, cards: [] };
    }
    const transcript = history
        .slice(-MAX_HISTORY)
        .map((turn) => `${turn.role === 'user' ? 'User' : ASSISTANT_NAME}: ${turn.text}`)
        .join('\n');
    const prompt = `${systemPrompt(await kitchenContext())}

Conversation so far:
${transcript || '(new conversation)'}
User: ${message}`;

    const raw = await generateText(prompt, { feature: 'chat' });
    const { reply, actions } = parseResponse(raw);
    const cards = actions.length ? await runTools(actions) : [];
    return { reply: reply || (cards.length ? 'Done.' : "Sorry, I didn't get that. Try asking another way?"), cards };
}
