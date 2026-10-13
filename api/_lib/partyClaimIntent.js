/** Deterministic party-chat commands (claims and missing-ingredient actions). */

function stripAmpiMention(text) {
    return String(text || '')
        .trim()
        .replace(/^@ampi\b[:,\s-]*/i, '')
        .trim();
}

function cleanIngredient(raw) {
    return String(raw || '')
        .replace(/[.!?]+$/g, '')
        .replace(/^(?:the|some|a|an)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}

/**
 * Whole-message bring/claim utterances.
 * "I'll bring the tortillas" / "@Ampi Katie is bringing cheese"
 * @returns {{ kind: 'self' | 'member', ingredientName: string, claimedByMemberName?: string, exclusive: true } | null}
 */
export function parsePartyClaimUtterance(text) {
    const body = stripAmpiMention(text);
    if (!body) return null;

    const self = body.match(
        /^(?:i['’]ll|i will|i can|i am going to|i['’]m going to|im going to)\s+bring\s+(.+)$/i
    );
    if (self) {
        const ingredientName = cleanIngredient(self[1]);
        if (!ingredientName) return null;
        return { kind: 'self', ingredientName, exclusive: true };
    }

    const other = body.match(
        /^([A-Za-z][\w.'’-]{0,30}(?:\s+[A-Za-z][\w.'’-]{0,30}){0,2})\s+(?:is bringing|will bring|will be bringing)\s+(.+)$/i
    );
    if (other) {
        const claimedByMemberName = other[1].trim();
        if (/^(i|we|ampi|someone|they)$/i.test(claimedByMemberName)) return null;
        const ingredientName = cleanIngredient(other[2]);
        if (!ingredientName) return null;
        return { kind: 'member', claimedByMemberName, ingredientName, exclusive: true };
    }

    return null;
}

/**
 * "@Ampi add the missing ingredients to my grocery list"
 * "@Ampi add missing ingredients as party meal items to claim"
 * @returns {{ kind: 'grocery' | 'claims' | 'both', exclusive: true } | null}
 */
export function parsePartyMissingCommand(text) {
    const body = stripAmpiMention(text);
    if (!/^add\b/i.test(body) || !/\bmissing\b/i.test(body)) return null;
    const grocery = /\b(grocery|shopping)\b/i.test(body);
    const claims = /\b(claim|party meal)\b/i.test(body);
    if (!grocery && !claims) return null;
    let kind = 'grocery';
    if (grocery && claims) kind = 'both';
    else if (claims) kind = 'claims';
    return { kind, exclusive: true };
}

export function resolvePartyMealId(meals) {
    const meal = (meals || []).find((m) => m && (m.sync_meal_id || m.syncMealId || m.liveMealId || m.id));
    if (!meal) return null;
    return meal.sync_meal_id || meal.syncMealId || meal.liveMealId || meal.id || null;
}

export function latestPartyRecipeCard(messages) {
    const list = messages || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const cards = list[i]?.attachment?.ampi?.cards;
        if (!Array.isArray(cards)) continue;
        for (let c = cards.length - 1; c >= 0; c -= 1) {
            const card = cards[c];
            if (card && (card.type === 'recipe_draft' || card.type === 'recipe_saved')) return card;
        }
    }
    return null;
}

function ingredientNamesFromCard(card) {
    if (!card) return [];
    if (Array.isArray(card.missingIngredients) && card.missingIngredients.length) {
        return card.missingIngredients.map((name) => String(name || '').trim()).filter(Boolean);
    }
    return (card.ingredients || [])
        .map((ing) => String(ing?.ingredient || ing?.name || '').trim())
        .filter(Boolean);
}

export function claimConfirmationText(claim, { myDisplayName } = {}) {
    const item = claim.ingredientName;
    if (claim.kind === 'self') {
        const who = myDisplayName || 'You';
        return `Got it — ${who} will bring the ${item}.`;
    }
    return `Got it — ${claim.claimedByMemberName} is bringing the ${item}.`;
}

/**
 * @returns {{ body: string, actions: object[], failed?: boolean } | null}
 */
export function planPartyChatCommand(text, { messages, meals, myDisplayName } = {}) {
    const claim = parsePartyClaimUtterance(text);
    if (claim) {
        const mealId = resolvePartyMealId(meals);
        if (!mealId) {
            return {
                body: `I couldn't record that yet — add a party meal first, then tell me who is bringing the ${claim.ingredientName}.`,
                actions: [],
            };
        }
        const args = {
            mealId: String(mealId),
            recipeId: 'party_chat',
            ingredientName: claim.ingredientName,
        };
        if (claim.kind === 'member') args.claimedByMemberName = claim.claimedByMemberName;
        else if (myDisplayName) args.claimedByMemberName = myDisplayName;
        return {
            body: claimConfirmationText(claim, { myDisplayName }),
            actions: [{ tool: 'claim_party_ingredient', args }],
        };
    }

    const missing = parsePartyMissingCommand(text);
    if (!missing) return null;

    const card = latestPartyRecipeCard(messages);
    const names = ingredientNamesFromCard(card);
    if (!card || !names.length) {
        return {
            body: "I don't see a recipe card in this chat yet. Ask me for a meal first.",
            actions: [],
        };
    }

    const mealId = resolvePartyMealId(meals);
    const actions = [];
    const bits = [];
    if (missing.kind === 'grocery' || missing.kind === 'both') {
        actions.push({
            tool: 'add_to_grocery',
            args: { items: names.map((name) => ({ name })) },
        });
        bits.push(`Added the missing ingredients to your grocery list: ${names.join(', ')}.`);
    }
    if (missing.kind === 'claims' || missing.kind === 'both') {
        if (mealId) {
            for (const name of names) {
                actions.push({
                    tool: 'claim_party_ingredient',
                    args: {
                        mealId: String(mealId),
                        recipeId: card.recipeId || 'party_chat',
                        ingredientName: name,
                        registerOnly: true,
                    },
                });
            }
            bits.push('Added them on the party meal for someone to claim.');
        } else {
            bits.push('Add a party meal first if you also want them listed to claim.');
        }
    }
    return { body: bits.join(' '), actions };
}
