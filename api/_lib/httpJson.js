/** Safe JSON body reads for OpenRouter and API handlers. */

export function friendlyHttpBodySnippet(raw, maxLen = 140) {
    const text = String(raw || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return '';
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

export function looksLikeJsonBody(raw, contentType = '') {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('json')) return true;
    const t = String(raw || '').trim();
    return t.startsWith('{') || t.startsWith('[');
}

/**
 * @param {string} raw
 * @param {{ contentType?: string, status?: number }} [meta]
 */
export function parseJsonBody(raw, meta = {}) {
    const text = String(raw ?? '');
    if (!looksLikeJsonBody(text, meta.contentType)) {
        const snippet = friendlyHttpBodySnippet(text);
        const status = meta.status;
        const prefix = status ? `Server error (${status})` : 'Server returned a non-JSON response';
        return {
            ok: false,
            error: 'non_json_response',
            message: snippet ? `${prefix}: ${snippet}` : `${prefix}. Try again in a moment.`,
        };
    }
    try {
        return { ok: true, json: JSON.parse(text) };
    } catch (error) {
        return {
            ok: false,
            error: 'invalid_json',
            message: `Couldn't read the server response (${error?.message || 'invalid JSON'}). Try again.`,
        };
    }
}
