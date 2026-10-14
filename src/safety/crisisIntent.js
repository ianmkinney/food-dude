/**
 * High-precision crisis / medical-emergency check.
 * The canned reply is substituted only when the latest user message shows
 * explicit intent. Cooking chat never receives it, even if a model copies a script.
 */

export const CRISIS_REPLY =
    "I'm only a cooking assistant and can't help with this. If you're in crisis or thinking about hurting yourself, call or text 988 (Suicide & Crisis Lifeline, US). If you or someone else is in danger or having a medical emergency or a severe allergic reaction, call 911 now.";

export const COOKING_FALLBACK_REPLY =
    "I'm here to help you cook. Say what you'd like and I'll write the recipes.";

/** Appended on one retry when a model echoes a crisis script on a cooking turn. */
export const CRISIS_ECHO_RETRY_NOTE =
    'Your previous reply was a canned refusal. The user is cooking, not reporting an emergency. Answer the cooking request normally. If they asked for more than one recipe or meal, emit one create_recipe action per dish in this same response. Do not refuse.';

const SUICIDE_MENU = /\bsuicide\s+(?:wings?|sauces?|spice|blend|burritos?|pizzas?|rolls?|challenge)\b/i;

const STRONG_PATTERNS = [
    /\bsuicidal\b/i,
    /\bcommit(?:ting)? suicide\b/i,
    /\bthinking about suicide\b/i,
    /\bkill myself\b/i,
    /\bkilling myself\b/i,
    /\bend my life\b/i,
    /\bwant to die\b/i,
    /\bwanna die\b/i,
    /\b(?:i'm|i am|im) going to die\b/i,
    /\bi (?:want to |wanna |'m going to |am going to )?end it all\b/i,
    /\bi'll end it all\b/i,
    /\bi will end it all\b/i,
    /^end it all[.!]?$/i,
    /\bi don'?t want to (?:live|be alive)\b/i,
    /\bi do not want to live\b/i,
    /\bbetter off dead\b/i,
    /\bself[-\s]?harm\b/i,
    /\bhurt(?:ing)? myself\b/i,
    /\bharm(?:ing)? myself\b/i,
    /\bcutting myself\b/i,
    /\b(?:want to|going to|gonna) cut myself\b/i,
    /\bi(?:'ve| have)? overdos(?:e|ed)\b/i,
    /\boverdos(?:e|ed|ing) on\b/i,
    /\bi(?:'m| am) being abused\b/i,
    /\babusing me\b/i,
    /\b(?:domestic|sexual|child) abuse\b/i,
    /\bi(?:'m| am) having (?:a |an )?(?:severe )?allergic reaction\b/i,
    /\bthis is (?:a |an )?(?:severe )?allergic reaction\b/i,
    /\banaphyla(?:xis|ctic)\b/i,
    /\b(?:need|use|using|grab|get) (?:my |the |an )?epi[-\s]?pen\b/i,
    /\b(?:this is|i(?:'m| am) having) a medical emergency\b/i,
    /\bi need an ambulance\b/i,
    /\bcall (?:an )?ambulance\b/i,
];

const BREATHE = /\bi can(?:not|'t) breathe\b/i;
const THROAT = /\bthroat (?:is |'s )?(?:closing|swelling|swollen|closed)\b/i;
const COOKING_HYPERBOLE =
    /\b(spicy|spice|pepper|chili|chile|hot sauce|so hot|wasabi|horseradish|onion|garlic|fajita)\b/i;

function mentionsSuicide(text) {
    if (/\bsuicidal\b/i.test(text)) return true;
    if (!/\bsuicide\b/i.test(text)) return false;
    if (SUICIDE_MENU.test(text)) return false;
    return true;
}

/**
 * True only for explicit self-harm, suicide, medical-emergency, or
 * happening-now severe allergic reaction. Cooking idioms do not match.
 * @param {string} text latest user message only
 */
export function isCrisisMessage(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return false;
    if (STRONG_PATTERNS.some((re) => re.test(raw)) || mentionsSuicide(raw)) return true;
    if ((BREATHE.test(raw) || THROAT.test(raw)) && !COOKING_HYPERBOLE.test(raw)) return true;
    return false;
}

/** Model output that is the canned crisis refusal (or a close copy of it). */
export function looksLikeCannedCrisisReply(text) {
    const t = String(text || '');
    if (!t.trim()) return false;
    if (/only a cooking assistant and can'?t help with this/i.test(t)) return true;
    if (/\b988\b/.test(t) && (/\b911\b/.test(t) || /crisis lifeline|suicide\s*&\s*crisis/i.test(t))) return true;
    return false;
}

export function unwantedCrisisEcho(userMessage, reply) {
    return !isCrisisMessage(userMessage) && looksLikeCannedCrisisReply(reply);
}

export function replacementForCrisisEcho(actions) {
    const creates = (actions || []).filter((action) => action?.tool === 'create_recipe' && action.args);
    const titles = creates.map((action) => String(action.args.title || '').trim()).filter(Boolean);
    if (titles.length > 1) return `Here are ${titles.length} recipes: ${titles.join(', ')}.`;
    if (titles.length === 1) return `Here's ${titles[0]}.`;
    return COOKING_FALLBACK_REPLY;
}
