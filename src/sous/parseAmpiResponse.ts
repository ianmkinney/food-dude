import type { ToolCall } from './tools';
import {
    coerceAmpiDisplayText as coerceAmpiDisplayTextRaw,
    extractFirstJsonObject,
    parseAmpiResponse as parseAmpiResponseRaw,
} from '../../api/_lib/ampiResponseParse.js';

export type ParsedAmpiResponse = {
    reply: string;
    actions: ToolCall[];
    parsed: boolean;
};

export function parseAmpiResponse(raw: string): ParsedAmpiResponse {
    const result = parseAmpiResponseRaw(raw);
    return {
        reply: result.reply,
        actions: result.actions as ToolCall[],
        parsed: result.parsed,
    };
}

export { coerceAmpiDisplayTextRaw as coerceAmpiDisplayText, extractFirstJsonObject };
