import { formatPartyAmpiReplyBody } from '../../api/_lib/partyAmpiReply.js';
import {
    partyAmpiAttachmentFromTurn,
    partyAmpiShouldAutoAddToMeals,
    synthesizePartyAmpiReplyText,
} from '../../api/_lib/partyAmpiTurn.js';
import { generateMultimodal, generateText } from './aiClient';
import { requireAiConfigured } from './aiSettings';
import { hasPlatformAiAccess } from '../platform/ownerSession';
import { ASSISTANT_NAME } from '../config/assistant';
import { isMutatingAction } from '../sous/confirmActions';
import { runTools } from '../sous/tools';
import { TOOL_SPEC } from '../sous/tools';

const MENTION = /@ampi\b/i;

export const PARTY_AMPI_EMPTY_REPLY =
    `${ASSISTANT_NAME} couldn't finish that reply. Tap retry on your message to ask again.`;

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

function mapMessagesToTurns(messages) {
    return (messages || [])
        .slice(-24)
        .map((m) => {
            const text = String(m.body || '').trim();
            if (!text) return null;
            if (m.isAmpi) {
                return { role: 'assistant', text };
            }
            const who = m.senderDisplayName || 'Member';
            return { role: 'user', text: `${who}: ${text}` };
        })
        .filter(Boolean);
}

function buildPartySystemPrompt({ meals, claims }) {
    const mealLines = (meals || []).map((meal) => {
        const recipes = (meal.recipe_ids || meal.recipeIds || []).join(', ');
        return `- ${meal.name}${recipes ? ` (recipes: ${recipes})` : ''}`;
    });
    const claimLines = (claims || []).map(
        (c) => `- ${c.ingredient_name || c.ingredientName}: ${c.claimed_by_display_name || c.claimedByDisplayName || 'unclaimed'}`
    );
    return `You are ${ASSISTANT_NAME}, helping a party plan food together in group chat.
Use the recent conversation. When the host asks for a cuisine or meal idea, call create_recipe with a complete recipe (title, ingredients, instructions, servings).
Always include a short reply string AND actions in your JSON response. Never leave reply empty when you propose a recipe.

Party meals:
${mealLines.join('\n') || '(none yet)'}

Ingredient claims:
${claimLines.join('\n') || '(none)'}

Tools:
${TOOL_SPEC}`;
}

function buildPartyContext({ messages, meals, claims, prompt }) {
    const lines = (messages || []).slice(-30).map((m) => {
        const attach = m.attachment?.fileName ? ` [attachment: ${m.attachment.fileName}]` : '';
        return `${m.senderDisplayName || 'Member'}: ${m.body || ''}${attach}`.trim();
    });
    const mealLines = (meals || []).map((meal) => {
        const recipes = (meal.recipe_ids || meal.recipeIds || []).join(', ');
        return `- ${meal.name}${recipes ? ` (recipes: ${recipes})` : ''}`;
    });
    const claimLines = (claims || []).map(
        (c) => `- ${c.ingredient_name || c.ingredientName}: ${c.claimed_by_display_name || c.claimedByDisplayName || 'unclaimed'}`
    );
    return `${buildPartySystemPrompt({ meals, claims })}

Recent messages:
${lines.join('\n') || '(none)'}

Party meals:
${mealLines.join('\n') || '(none)'}

Ingredient claims:
${claimLines.join('\n') || '(none)'}

Latest request: ${prompt}

Reply briefly for the whole group.`;
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
    const userPrompt = String(ctx.prompt || '').replace(MENTION, ASSISTANT_NAME).trim();
    const system = buildPartySystemPrompt(ctx);
    const turns = mapMessagesToTurns(ctx.messages);
    const images = ctx.images || [];

    if (images.length) {
        const text = await generateMultimodal({
            system,
            turns: [...turns, { role: 'user', text: userPrompt, images }],
            feature: 'partyChat',
            prompt: userPrompt,
            images,
        });
        return String(text || '').trim();
    }

    if (turns.length) {
        const text = await generateMultimodal({
            system,
            turns: [...turns, { role: 'user', text: userPrompt }],
            feature: 'partyChat',
            prompt: userPrompt,
        });
        return String(text || '').trim();
    }

    const text = await generateText(buildPartyContext({ ...ctx, prompt: userPrompt }), { feature: 'partyChat' });
    return String(text || '').trim();
}

/**
 * Parse model output, run safe tools, build party chat payload for POST.
 * @param {string} raw
 * @param {{ userPrompt?: string, autoAddToParty?: (recipeId: number) => Promise<void> }} [options]
 * @returns {Promise<{ body: string, attachment: object | null, cards: import('../sous/tools').SousCard[] }>}
 */
export async function finalizePartyAmpiReplyForPost(raw, options = {}) {
    const { text, actions, cards: draftCards } = formatPartyAmpiReplyBody(raw);
    let reply = text || synthesizePartyAmpiReplyText('', actions);
    const immediate = (actions || []).filter((a) => !isMutatingAction(a));
    const mutating = (actions || []).filter(isMutatingAction);
    const savedCards = [];

    if (immediate.length) {
        try {
            savedCards.push(...(await runTools(immediate)));
        } catch (error) {
            console.warn('[party ampi tools]', error?.message || error);
        }
    }

    const recipeDrafts = draftCards || [];
    let pendingActions = mutating.filter(
        (a) => a.tool !== 'create_recipe' && a.tool !== 'import_recipe'
    );

    const createActions = mutating.filter((a) => a.tool === 'create_recipe' || a.tool === 'import_recipe');
    const autoAdd = partyAmpiShouldAutoAddToMeals(options.userPrompt);

    if (autoAdd && createActions.length) {
        try {
            const created = await runTools(createActions);
            savedCards.push(...created);
            for (const card of created) {
                if (card.type === 'recipe' && options.autoAddToParty) {
                    await options.autoAddToParty(card.recipe.id);
                }
            }
        } catch (error) {
            console.warn('[party ampi auto-add]', error?.message || error);
            pendingActions = [...pendingActions, ...createActions];
        }
    } else if (createActions.length) {
        pendingActions = [...pendingActions, ...createActions];
    }

    if (!reply && savedCards.length) {
        const recipe = savedCards.find((c) => c.type === 'recipe');
        if (recipe) reply = `Saved “${recipe.recipe.title}” for the party.`;
    }

    if (!reply && recipeDrafts.length) {
        reply = synthesizePartyAmpiReplyText('', createActions);
    }

    if (!reply) {
        reply = PARTY_AMPI_EMPTY_REPLY;
    }

    if (pendingActions.length && !recipeDrafts.length) {
        const hint = `Open ${ASSISTANT_NAME} in the app to confirm recipe or list changes.`;
        reply = reply.includes(hint) ? reply : `${reply}\n\n${hint}`;
    }

    const attachment = partyAmpiAttachmentFromTurn({
        cards: [
            ...recipeDrafts,
            ...savedCards
                .filter((c) => c.type === 'recipe')
                .map((c) => ({
                    type: 'recipe_saved',
                    recipeId: c.recipe.id,
                    title: c.recipe.title,
                    imageUri: c.recipe.image_uri,
                })),
        ],
        pendingActions,
        failed: reply === PARTY_AMPI_EMPTY_REPLY,
    });

    return {
        body: reply,
        attachment,
        cards: savedCards,
    };
}
