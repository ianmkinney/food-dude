const IMAGE_MIME = /^image\/(png|jpeg|webp|gif)$/;

export function userContentParts(text, images) {
    const imgs = Array.isArray(images) ? images : [];
    if (!imgs.length) return text;
    const parts = [{ type: 'text', text: text || '(see attached images)' }];
    for (const img of imgs) {
        if (!img?.mimeType || !img?.data) continue;
        if (!IMAGE_MIME.test(String(img.mimeType))) continue;
        parts.push({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        });
    }
    return parts.length === 1 ? text : parts;
}

/**
 * @param {{ system?: string, turns?: { role: string, text: string, images?: object[] }[], prompt?: string, images?: object[] }} body
 */
export function buildOpenRouterMessages(body) {
    const messages = [];
    const system = typeof body?.system === 'string' ? body.system.trim() : '';
    if (system) {
        messages.push({ role: 'system', content: system });
    }

    const turns = Array.isArray(body?.turns) ? body.turns : null;
    if (turns?.length) {
        for (const turn of turns) {
            const role = turn.role === 'assistant' || turn.role === 'sous' ? 'assistant' : 'user';
            const text = String(turn.text || '').trim();
            if (!text && !(turn.images?.length)) continue;
            messages.push({ role, content: userContentParts(text, turn.images) });
        }
        return messages;
    }

    const prompt = body?.prompt;
    if (!prompt || typeof prompt !== 'string') {
        throw new Error('Missing prompt');
    }
    const images = Array.isArray(body?.images) ? body.images : [];
    messages.push({ role: 'user', content: userContentParts(prompt, images) });
    return messages;
}

export function bodyHasImages(body) {
    if (Array.isArray(body?.images) && body.images.length) return true;
    if (!Array.isArray(body?.turns)) return false;
    return body.turns.some((t) => Array.isArray(t.images) && t.images.length > 0);
}
