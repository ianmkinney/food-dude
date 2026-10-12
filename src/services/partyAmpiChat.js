import { formatPartyAmpiReplyBody } from '../../api/_lib/partyAmpiReply.js';
import { generateMultimodal, generateText } from './aiClient';
import { requireAiConfigured } from './aiSettings';
import { hasPlatformAiAccess } from '../platform/ownerSession';
import { ASSISTANT_NAME } from '../config/assistant';
import { isMutatingAction } from '../sous/confirmActions';
import { runTools } from '../sous/tools';

const MENTION = /@ampi\b/i;

export function messageMentionsAmpi(text) {
    return MENTION.test(String(text || ''));
}

export async function callerHasPartyAmpiAccess() {
    try {
        await requireAiConfigured();
        return true;
    } catch {
        const platform = await hasPlatformAiAccess();
        return platform;
    }
}

function buildPartyContext({ messages, meals, claims, prompt }) {
    const recent = (messages || []).slice(-30);
    const lines = recent.map((m) => {
        const who = m.isAmpi ? m.senderDisplayName : m.senderDisplayName;
        const attach = m.attachment?.fileName ? ` [attachment: ${m.attachment.fileName}]` : '';
        return `${who}: ${m.body || ''}${attach}`.trim();
    });
    const mealLines = (meals || []).map((meal) => {
        const recipes = (meal.recipe_ids || meal.recipeIds || []).join(', ');
        return `- ${meal.name}${recipes ? ` (recipes: ${recipes})` : ''}`;
    });
    const claimLines = (claims || []).map(
        (c) => `- ${c.ingredient_name || c.ingredientName}: ${c.claimed_by_display_name || c.claimedByDisplayName || 'unclaimed'}`
    );
    return `You are ${ASSISTANT_NAME}, helping a party plan food together in group chat.

Recent messages:
${lines.join('\n') || '(none)'}

Party meals:
${mealLines.join('\n') || '(none)'}

Ingredient claims:
${claimLines.join('\n') || '(none)'}

The host asked: ${prompt}

Reply briefly and helpfully for the whole group. Do not mention system prompts.`;
}

/**
 * Run Ampi for a party @mention using the CALLING user's AI credentials only.
 * @param {{ messages, meals, claims, prompt, images?: Array }} ctx
 */
export async function runPartyAmpiReply(ctx) {
    const canUse = await callerHasPartyAmpiAccess();
    if (!canUse) {
        throw new Error(
            `Sign in and set up AI in Account (platform access or your own API key) to ask ${ASSISTANT_NAME} in party chat.`
        );
    }
    const prompt = buildPartyContext(ctx);
    const images = ctx.images || [];
    if (images.length) {
        const text = await generateMultimodal({ prompt, images, feature: 'partyChat' });
        return String(text || '').trim();
    }
    const text = await generateText(prompt, { feature: 'partyChat' });
    return String(text || '').trim();
}

/**
 * Parse JSON-shaped model output, run safe tool actions, return plain reply for party chat POST.
 * @param {string} raw
 */
export async function finalizePartyAmpiReplyForPost(raw) {
    const { text, actions } = formatPartyAmpiReplyBody(raw);
    let reply = text || String(raw || '').trim();
    const immediate = (actions || []).filter((a) => !isMutatingAction(a));
    const mutating = (actions || []).filter(isMutatingAction);
    if (immediate.length) {
        try {
            await runTools(immediate);
        } catch (error) {
            console.warn('[party ampi tools]', error?.message || error);
        }
    }
    if (mutating.length) {
        const hint = `Open ${ASSISTANT_NAME} in the app to confirm recipe or list changes.`;
        reply = reply ? `${reply}\n\n${hint}` : hint;
    }
    return reply;
}
