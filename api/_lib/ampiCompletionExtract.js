import { parseAmpiResponse } from './ampiResponseParse.js';

function parseToolArgs(raw) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
    const s = String(raw).trim();
    if (!s) return {};
    try {
        const parsed = JSON.parse(s);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function pushToolCall(actions, name, args) {
    const tool = String(name || '').trim();
    if (!tool) return;
    actions.push({ tool, args: parseToolArgs(args) });
}

/**
 * Normalize one OpenRouter chat completion message into reply + raw actions.
 * @param {object} message
 * @returns {{ reply: string, actions: { tool: string, args: object }[], source: string }}
 */
export function extractAmpiTurnFromMessage(message) {
    const actions = [];
    let reply = '';

    if (!message || typeof message !== 'object') {
        return { reply: '', actions: [], source: 'empty' };
    }

    if (Array.isArray(message.content)) {
        for (const block of message.content) {
            if (!block || typeof block !== 'object') continue;
            if (block.type === 'text' && typeof block.text === 'string') reply += block.text;
            if (block.type === 'tool_use' && block.name) pushToolCall(actions, block.name, block.input);
        }
        if (actions.length) {
            return { reply: reply.trim(), actions, source: 'anthropic_blocks' };
        }
    }

    if (Array.isArray(message.tool_calls)) {
        for (const tc of message.tool_calls) {
            const fn = tc?.function || tc;
            pushToolCall(actions, fn?.name, fn?.arguments);
        }
        if (typeof message.content === 'string') reply = message.content;
        if (actions.length) {
            return { reply: reply.trim(), actions, source: 'tool_calls' };
        }
    }

    const content = message.content;
    if (typeof content === 'string' && content.trim()) {
        const parsed = parseAmpiResponse(content);
        if (parsed.parsed) {
            return { reply: parsed.reply, actions: parsed.actions, source: 'content_json' };
        }
        return { reply: content.trim(), actions: [], source: 'content_text' };
    }

    return { reply: reply.trim(), actions, source: 'fallback' };
}

/**
 * @param {object} completionJson — OpenRouter non-stream response body
 */
export function extractAmpiTurnFromCompletion(completionJson) {
    const message = completionJson?.choices?.[0]?.message;
    return extractAmpiTurnFromMessage(message);
}

/**
 * @param {string} rawText — assistant text (BYOK / legacy)
 */
export function extractAmpiTurnFromText(rawText) {
    const parsed = parseAmpiResponse(String(rawText || ''));
    if (parsed.parsed) {
        return { reply: parsed.reply, actions: parsed.actions, source: 'text_json' };
    }
    return { reply: parsed.reply || String(rawText || '').trim(), actions: [], source: 'text_plain' };
}
