/** @typedef {{ tool: string, args?: object }} ToolCall */

export function stripCodeFences(text) {
    let cleaned = String(text || '').trim();
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```\n?/g, '');
    }
    return cleaned.trim();
}

function unwrapJsonString(text) {
    let current = String(text || '').trim();
    for (let i = 0; i < 3; i++) {
        if (!current.startsWith('"') && !current.startsWith("'")) break;
        try {
            const parsed = JSON.parse(current);
            if (typeof parsed === 'string') {
                current = parsed.trim();
                continue;
            }
        } catch {
            break;
        }
        break;
    }
    return current;
}

/** Balanced `{ ... }` slice; respects strings and escapes. */
export function extractFirstJsonObject(text) {
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escape) escape = false;
            else if (ch === '\\') escape = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

function lenientJsonParse(slice) {
    try {
        return JSON.parse(slice);
    } catch {
        try {
            return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
        } catch {
            return null;
        }
    }
}

function normalizeActions(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((a) => a && typeof a.tool === 'string');
}

function coerceReply(value) {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    return String(value);
}

function stripJsonShell(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) return trimmed;
    const replyMatch = trimmed.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (replyMatch) {
        try {
            return JSON.parse(`"${replyMatch[1]}"`);
        } catch {
            return replyMatch[1].replace(/\\"/g, '"');
        }
    }
    return trimmed;
}

function looksLikeJson(text) {
    return /^\s*(\{|\[|")/.test(text);
}

/**
 * @param {string} raw
 * @returns {{ reply: string, actions: ToolCall[], parsed: boolean }}
 */
export function parseAmpiResponse(raw) {
    let cleaned = stripCodeFences(String(raw || '')).trim();
    cleaned = unwrapJsonString(cleaned);

    const slice = extractFirstJsonObject(cleaned) || (cleaned.startsWith('{') ? cleaned : null);
    if (slice) {
        const parsed = lenientJsonParse(slice);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            if ('reply' in parsed || 'actions' in parsed) {
                return {
                    reply: coerceReply(parsed.reply),
                    actions: normalizeActions(parsed.actions),
                    parsed: true,
                };
            }
        }
    }

    if (looksLikeJson(cleaned) || cleaned.includes('"reply"')) {
        const stripped = stripJsonShell(cleaned);
        if (stripped && stripped !== cleaned) {
            return { reply: stripped.trim(), actions: [], parsed: false };
        }
    }

    return { reply: cleaned, actions: [], parsed: false };
}

export function coerceAmpiDisplayText(text) {
    const { reply, parsed } = parseAmpiResponse(text);
    if (parsed || (reply && reply !== String(text).trim())) return reply;
    return text;
}
