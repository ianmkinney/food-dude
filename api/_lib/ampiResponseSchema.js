/** OpenRouter / OpenAI-style json_schema for Ampi chat turns. */
export const AMPI_CHAT_JSON_SCHEMA = {
    name: 'ampi_chat_turn',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            reply: { type: 'string', description: 'Short user-facing reply (Markdown-light).' },
            actions: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        tool: { type: 'string' },
                        args: { type: 'object', additionalProperties: true },
                    },
                    required: ['tool', 'args'],
                },
            },
        },
        required: ['reply', 'actions'],
    },
};

export function ampiChatResponseFormat() {
    return {
        type: 'json_schema',
        json_schema: AMPI_CHAT_JSON_SCHEMA,
    };
}
