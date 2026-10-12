import { coerceAmpiDisplayText } from './ampiResponseParse.js';
import { normalizeAmpiTurnFromText } from './ampiModelAdapter.js';

/**
 * Normalize raw model output for party chat storage/display (reply text only).
 * @param {string} raw
 * @returns {{ text: string, actions: { tool: string, args?: object }[], parsed: boolean }}
 */
export function formatPartyAmpiReplyBody(raw) {
    const { reply, actions, parsed } = normalizeAmpiTurnFromText(String(raw || ''));
    const text = (parsed ? reply : coerceAmpiDisplayText(raw)).trim();
    return { text, actions, parsed };
}
