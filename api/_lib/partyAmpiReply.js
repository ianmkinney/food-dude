import { coerceAmpiDisplayText } from './ampiResponseParse.js';
import { normalizeAmpiTurnFromText } from './ampiModelAdapter.js';
import {
    buildPartyAmpiDraftCards,
    synthesizePartyAmpiReplyText,
} from './partyAmpiTurn.js';

/**
 * @param {string} raw
 * @returns {{ text: string, actions: { tool: string, args?: object }[], parsed: boolean, cards: object[] }}
 */
export function formatPartyAmpiReplyBody(raw) {
    const { reply, actions, parsed } = normalizeAmpiTurnFromText(String(raw || ''));
    let text = (parsed ? reply : coerceAmpiDisplayText(raw)).trim();
    if (!text) {
        text = synthesizePartyAmpiReplyText(parsed ? reply : '', actions);
    }
    const cards = buildPartyAmpiDraftCards(actions);
    return { text, actions, parsed, cards };
}
