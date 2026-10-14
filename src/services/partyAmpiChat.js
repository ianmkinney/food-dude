import { AMPI_MULTI_RECIPE_RULE, AMPI_NO_CRISIS_SCRIPT_RULE } from '../../api/_lib/ampiActionSchema.js';
import { formatPartyAmpiReplyBody } from '../../api/_lib/partyAmpiReply.js';
import { partyModelEchoesCrisis, sanitizePartyAmpiModelRaw } from '../safety/partyAmpiSafety.js';
import { recipeCountRetryNote, requestedNewRecipeCount } from '../../api/_lib/recipeRequestCount.js';
import { CRISIS_ECHO_RETRY_NOTE, CRISIS_REPLY, isCrisisMessage, replacementForCrisisEcho } from '../safety/crisisIntent.js';
import {
    partyAmpiAttachmentFromTurn,
    partyAmpiShouldAutoAddToMeals,
    partyMealRecipeIdLabel,
    synthesizePartyAmpiReplyText,
} from '../../api/_lib/partyAmpiTurn.js';
import { generateMultimodal, generateText } from './aiClient';
import { requireAiConfigured } from './aiSettings';
import { hasPlatformAiAccess } from '../platform/ownerSession';
import { ASSISTANT_NAME } from '../config/assistant';
import { isMutatingAction } from '../sous/confirmActions';
import { runTools } from '../sous/tools';
import { TOOL_SPEC } from '../sous/tools';
import { enrichPartyAmpiCardsWithPantry } from '../../api/_lib/partyAmpiTurn.js';
import { PARTY_AMPI_PANTRY_PREFILL } from '../../api/_lib/partyAmpiPrompt.js';
import { planPartyChatCommand } from '../../api/_lib/partyClaimIntent.js';
import { runPartyAmpiTools } from './partyAmpiTools';

export { PARTY_AMPI_PANTRY_PREFILL };

const MENTION = /@ampi\b/i;

const PARTY_TOOL_SPEC = `${TOOL_SPEC}

Party-only tools (use mealId UUIDs from Party meals; recipeId may be "party_chat" until a recipe is saved):
- claim_party_ingredient {"mealId": string, "recipeId": string, "ingredientName": string, "claimedByMemberName"?: string}: record who brings an ingredient. When someone says they will bring an item, set claimedByMemberName to their display name; omit to assign the speaker.
- unclaim_party_ingredient {"claimId": string}: remove an ingredient claim.
When suggesting meals from shared pantries, prefer ingredients members already have and mention gaps in reply text.`;

const PARTY_IMMEDIATE_TOOLS = new Set([
    'add_to_grocery',
    'claim_party_ingredient',
    'unclaim_party_ingredient',
]);

function isPartyImmediateTool(tool) {
    return PARTY_IMMEDIATE_TOOLS.has(tool);
}

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

function formatPantryLines(pantryByMember) {
    const lines = [];
    for (const member of pantryByMember || []) {
        const itemBits = (member.items || [])
            .slice(0, 80)
            .map((it) => {
                const amt = [it.quantity, it.unit].filter(Boolean).join(' ');
                const fresh = it.freshnessPct != null ? `fresh ${it.freshnessPct}%` : '';
                const exp = it.expirationDate ? `exp ${it.expirationDate}` : '';
                return `${it.name}${amt ? ` (${amt})` : ''}${fresh ? `, ${fresh}` : ''}${exp ? `, ${exp}` : ''}`;
            });
        if (itemBits.length) {
            lines.push(`${member.displayName}: ${itemBits.join('; ')}`);
        }
    }
    return lines;
}

function buildPartySystemPrompt({ meals, claims, pantryByMember }) {
    const mealLines = (meals || []).map((meal) => {
        const id = meal.sync_meal_id || meal.syncMealId || meal.liveMealId || meal.id;
        const recipes = partyMealRecipeIdLabel(meal);
        return `- ${meal.name} (mealId: ${id})${recipes ? ` recipes: ${recipes}` : ''}`;
    });
    const claimLines = (claims || []).map(
        (c) =>
            `- ${c.ingredient_name || c.ingredientName} (meal ${c.meal_id || c.mealId}): ${c.claimed_by_display_name || c.claimedByDisplayName || 'unclaimed'}`
    );
    const pantryLines = formatPantryLines(pantryByMember);
    return `You are ${ASSISTANT_NAME}, helping a party plan food together in group chat.
Use the recent conversation. When the host asks for a cuisine or meal idea, call create_recipe with a complete recipe (title, ingredients, instructions, servings), filled field by field.
${AMPI_MULTI_RECIPE_RULE}
${AMPI_NO_CRISIS_SCRIPT_RULE}
When members share pantries, suggest meals that use combined ingredients and call out missing items.
When someone volunteers to bring an ingredient or @mentions who brings what, use claim_party_ingredient and confirm in reply.
Always include a short reply string AND actions in your JSON response. Never leave reply empty when you propose a recipe.

Party meals:
${mealLines.join('\n') || '(none yet)'}

Ingredient claims:
${claimLines.join('\n') || '(none)'}

Shared pantries (opt-in per member):
${pantryLines.join('\n') || '(no members have shared pantries yet)'}

Tools:
${PARTY_TOOL_SPEC}`;
}

function buildPartyContext({ messages, meals, claims, pantryByMember, prompt }) {
    const lines = (messages || []).slice(-30).map((m) => {
        const attach = m.attachment?.fileName ? ` [attachment: ${m.attachment.fileName}]` : '';
        return `${m.senderDisplayName || 'Member'}: ${m.body || ''}${attach}`.trim();
    });
    const mealLines = (meals || []).map((meal) => {
        const recipes = partyMealRecipeIdLabel(meal);
        return `- ${meal.name}${recipes ? ` (recipes: ${recipes})` : ''}`;
    });
    const claimLines = (claims || []).map(
        (c) => `- ${c.ingredient_name || c.ingredientName}: ${c.claimed_by_display_name || c.claimedByDisplayName || 'unclaimed'}`
    );
    return `${buildPartySystemPrompt({ meals, claims, pantryByMember })}

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
async function callPartyModel({ system, turns, userPrompt, images, extraNote, ctx }) {
    const noted = extraNote ? `${system}\n\n${extraNote}` : system;
    if (images.length) {
        const text = await generateMultimodal({
            system: noted,
            turns: [...turns, { role: 'user', text: userPrompt, images }],
            feature: 'partyChat',
            prompt: userPrompt,
            images,
        });
        return String(text || '').trim();
    }
    if (turns.length) {
        const text = await generateMultimodal({
            system: noted,
            turns: [...turns, { role: 'user', text: userPrompt }],
            feature: 'partyChat',
            prompt: userPrompt,
        });
        return String(text || '').trim();
    }
    const base = buildPartyContext({ ...ctx, prompt: userPrompt });
    const text = await generateText(extraNote ? `${base}\n\n${extraNote}` : base, { feature: 'partyChat' });
    return String(text || '').trim();
}

export async function runPartyAmpiReply(ctx) {
    const canUse = await callerHasPartyAmpiAccess();
    if (!canUse) {
        throw new Error(
            `Sign in and set up AI in Account (platform access or your own API key) to ask ${ASSISTANT_NAME} in party chat.`
        );
    }
    const userPrompt = String(ctx.prompt || '').replace(MENTION, ASSISTANT_NAME).trim();
    if (isCrisisMessage(userPrompt)) {
        return JSON.stringify({ reply: CRISIS_REPLY, actions: [] });
    }
    const system = buildPartySystemPrompt({
        meals: ctx.meals,
        claims: ctx.claims,
        pantryByMember: ctx.pantryByMember,
    });
    const turns = mapMessagesToTurns(ctx.messages);
    const images = ctx.images || [];
    const call = (extraNote) => callPartyModel({ system, turns, userPrompt, images, extraNote, ctx });

    let raw = await call();
    if (partyModelEchoesCrisis(userPrompt, raw)) {
        raw = await call(CRISIS_ECHO_RETRY_NOTE);
        if (partyModelEchoesCrisis(userPrompt, raw)) {
            const { actions } = formatPartyAmpiReplyBody(raw);
            raw = JSON.stringify({ reply: replacementForCrisisEcho(actions), actions: actions || [] });
        }
    }
    const wanted = requestedNewRecipeCount(userPrompt);
    const { actions } = formatPartyAmpiReplyBody(raw);
    const created = (actions || []).filter((action) => action.tool === 'create_recipe');
    if (wanted != null && wanted >= 2 && created.length < wanted) {
        const retry = await call(recipeCountRetryNote(wanted, created.length));
        if (!partyModelEchoesCrisis(userPrompt, retry)) {
            const again = formatPartyAmpiReplyBody(retry);
            const againCreated = (again.actions || []).filter((action) => action.tool === 'create_recipe');
            if (againCreated.length >= created.length) raw = retry;
        }
    }
    return raw;
}

/**
 * Parse model output, run safe tools, build party chat payload for POST.
 * @param {string} raw
 * @param {{ userPrompt?: string, autoAddToParty?: (recipeId: number) => Promise<void> }} [options]
 * @returns {Promise<{ body: string, attachment: object | null, cards: import('../sous/tools').SousCard[] }>}
 */
/**
 * Apply a whole-message claim or missing-ingredient command without calling the model.
 * @returns {Promise<{ body: string, attachment: object | null } | null>}
 */
export async function executePartyChatCommand(text, partyContext = {}) {
    const plan = planPartyChatCommand(text, {
        messages: partyContext.messages,
        meals: partyContext.meals,
        myDisplayName: partyContext.myDisplayName,
    });
    if (!plan) return null;
    let body = String(plan.body || '').trim() || PARTY_AMPI_EMPTY_REPLY;
    let failed = false;
    if (plan.actions?.length && partyContext.livePartyId) {
        try {
            const grocery = plan.actions.filter((a) => a.tool === 'add_to_grocery');
            const claims = plan.actions.filter((a) => a.tool !== 'add_to_grocery');
            if (grocery.length) await runTools(grocery);
            if (claims.length) await runPartyAmpiTools(claims, partyContext);
        } catch (error) {
            failed = true;
            body = error?.message || PARTY_AMPI_EMPTY_REPLY;
        }
    }
    const attachment = partyAmpiAttachmentFromTurn({ cards: [], pendingActions: [], failed });
    return {
        body,
        attachment: attachment || (failed ? { ampi: { cards: [], pendingActions: [], failed: true } } : null),
    };
}

export async function finalizePartyAmpiReplyForPost(raw, options = {}) {
    const safeRaw = sanitizePartyAmpiModelRaw(raw, options.userPrompt);
    const { text, actions, cards: draftCardsRaw } = formatPartyAmpiReplyBody(safeRaw);
    const draftCards = enrichPartyAmpiCardsWithPantry(
        draftCardsRaw,
        options.partyContext?.pantryByMember
    );
    let reply = text || synthesizePartyAmpiReplyText('', actions);
    const immediate = (actions || []).filter((a) => isPartyImmediateTool(a.tool) || !isMutatingAction(a));
    const mutating = (actions || []).filter((a) => !immediate.includes(a));
    const savedCards = [];
    const partyCtx = options.partyContext;

    if (immediate.length) {
        try {
            for (const call of immediate) {
                if (isPartyImmediateTool(call.tool) && partyCtx?.livePartyId) {
                    savedCards.push(...(await runPartyAmpiTools([call], partyCtx)));
                } else {
                    savedCards.push(...(await runTools([call])));
                }
            }
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
