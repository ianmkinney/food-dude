import { friendlyHttpBodySnippet, looksLikeJsonBody, parseJsonBody } from '../../api/_lib/httpJson.js';

/**
 * @param {Response} response
 */
export async function readFetchJson(response) {
    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text().catch(() => '');
    const parsed = parseJsonBody(raw, { contentType, status: response.status });
    if (!parsed.ok) {
        return {
            ok: false,
            status: response.status,
            error: parsed.error,
            message: parsed.message,
            raw,
        };
    }
    return { ok: true, status: response.status, json: parsed.json, raw };
}

export { friendlyHttpBodySnippet, looksLikeJsonBody, parseJsonBody };
