/** Shared response helper for Instagram/TikTok import handlers. */

export function isStructuredImportPayload(body) {
    return Boolean(body?.title && Array.isArray(body.ingredients) && body.ingredients.length && Array.isArray(body.steps));
}

export function jsonFromSocialImport(result, sourcePlatform) {
    if (isStructuredImportPayload(result)) {
        return { status: 200, body: result };
    }
    return {
        status: 200,
        body: {
            text: result.text,
            image: result.image,
            sourceUrl: result.sourceUrl,
            sourcePlatform,
            author: result.author,
        },
    };
}

export function mapSocialImportError(code, platform) {
    const prefix = platform === 'tiktok' ? 'tiktok' : 'instagram';
    if (code === 'rate_limited') return { status: 429, error: 'rate_limited' };
    if (code === `${prefix}_login_wall`) return { status: 422, error: code };
    if (code === `invalid_${prefix}_url`) return { status: 400, error: 'bad_request' };
    if (code === `${prefix}_no_caption` || code === 'tiktok_oembed_failed') {
        return { status: 404, error: `${prefix}_no_caption` };
    }
    return { status: 404, error: `${prefix}_no_caption` };
}
