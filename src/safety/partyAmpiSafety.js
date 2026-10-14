import { formatPartyAmpiReplyBody } from '../../api/_lib/partyAmpiReply.js';
import {
    CRISIS_REPLY,
    isCrisisMessage,
    replacementForCrisisEcho,
    unwantedCrisisEcho,
} from './crisisIntent.js';

export function partyModelEchoesCrisis(userPrompt, raw) {
    const { text } = formatPartyAmpiReplyBody(raw);
    return unwantedCrisisEcho(userPrompt, text) || unwantedCrisisEcho(userPrompt, raw);
}

/**
 * Drop a copied crisis script unless the latest message is explicit.
 * Recipe actions on a cooking turn are kept.
 * @param {string} raw
 * @param {string} [userPrompt]
 */
export function sanitizePartyAmpiModelRaw(raw, userPrompt = '') {
    const prompt = String(userPrompt || '');
    if (prompt && isCrisisMessage(prompt)) {
        return JSON.stringify({ reply: CRISIS_REPLY, actions: [] });
    }
    if (partyModelEchoesCrisis(prompt, raw)) {
        const echoed = formatPartyAmpiReplyBody(raw);
        return JSON.stringify({
            reply: replacementForCrisisEcho(echoed.actions),
            actions: echoed.actions || [],
        });
    }
    return raw;
}
