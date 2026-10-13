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

/**
 * Repair already-saved party Ampi rows whose stored body is canonical JSON
 * with an empty `reply` (the badge-only bubble). Prefer attachment cards.
 * @param {{ body?: string, attachment?: object }} message
 */
export function visiblePartyAmpiContent(message) {
    const raw = String(message?.body || '');
    const parsed = formatPartyAmpiReplyBody(raw);
    const attachmentCards = Array.isArray(message?.attachment?.ampi?.cards)
        ? message.attachment.ampi.cards
        : [];
    const cards = attachmentCards.length ? attachmentCards : parsed.cards || [];
    let text = String(parsed.text || '').trim();
    if (!text && cards[0]?.title) {
        text = `Here's a ${cards[0].title} idea for the party.`;
    }
    return { text, cards };
}
