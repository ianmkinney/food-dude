import { coerceAmpiDisplayText, parseAmpiResponse } from './ampiResponseParse.js';

/**
 * Normalize raw model output for party chat storage/display (reply text only).
 * @param {string} raw
 * @returns {{ text: string, actions: import('./ampiResponseParse.js').ToolCall[], parsed: boolean }}
 */
export function formatPartyAmpiReplyBody(raw) {
    const { reply, actions, parsed } = parseAmpiResponse(String(raw || ''));
    const text = (parsed ? reply : coerceAmpiDisplayText(raw)).trim();
    return { text, actions, parsed };
}
