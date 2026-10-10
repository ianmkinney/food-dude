import { safeFetchHtml } from './ssrf.js';
import { metaContent } from './recipeExtract.js';

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);

const MOBILE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';

const GENERIC_OG_DESCRIPTIONS = [
    'view this post on instagram',
    'see instagram photos and videos',
    'log in to instagram',
];

const BIO_LINK_HINTS = [
    /\brecipe\s+in\s+(?:the\s+)?bio\b/i,
    /\blink\s+in\s+bio\b/i,
    /\bfull\s+recipe\b.*\b(?:bio|link)\b/i,
    /\b(?:bio|link)\b.*\b(?:full\s+)?recipe\b/i,
];

export function isInstagramHost(hostname) {
    const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase().replace(/^www\./, '');
    return INSTAGRAM_HOSTS.has(host) || host === 'instagram.com';
}

export function isInstagramPostUrl(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl).trim());
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        if (host !== 'instagram.com' && host !== 'm.instagram.com') return false;
        return /\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/.test(parsed.pathname);
    } catch {
        return false;
    }
}

export function extractInstagramShortcode(pathname) {
    const match = String(pathname || '').match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
}

export function canonicalInstagramPostUrl(shortcode) {
    return `https://www.instagram.com/p/${shortcode}/`;
}

export function embedCaptionedUrl(shortcode) {
    return `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
}

function decodeJsonString(raw) {
    if (!raw) return '';
    try {
        return JSON.parse(`"${raw}"`);
    } catch {
        return raw
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/\\\\/g, '\\');
    }
}

function cleanCaption(text) {
    if (!text) return '';
    return String(text)
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n/g, '\n')
        .trim();
}

function isGenericDescription(text) {
    const lower = String(text || '').toLowerCase().trim();
    if (!lower) return true;
    return GENERIC_OG_DESCRIPTIONS.some((snippet) => lower.includes(snippet));
}

export function extractCaptionFromHtml(html) {
    const og = metaContent(html, 'og:description');
    if (og && !isGenericDescription(og)) {
        return cleanCaption(og);
    }
    const twitter = metaContent(html, 'twitter:description');
    if (twitter && !isGenericDescription(twitter)) {
        return cleanCaption(twitter);
    }

    const patterns = [
        /"edge_media_to_caption":\s*\{\s*"edges":\s*\[\s*\{\s*"node":\s*\{\s*"text":\s*"((?:\\.|[^"\\])*)"/,
        /"caption":\s*"((?:\\.|[^"\\])*)"/,
        /"accessibility_caption":\s*"((?:\\.|[^"\\])*)"/,
    ];
    for (const re of patterns) {
        const match = html.match(re);
        if (match?.[1]) {
            const decoded = cleanCaption(decodeJsonString(match[1]));
            if (decoded && !isGenericDescription(decoded)) return decoded;
        }
    }
    return '';
}

export function extractAuthorFromHtml(html) {
    const ogTitle = metaContent(html, 'og:title');
    if (ogTitle) {
        const m = ogTitle.match(/^(.+?)\s+on\s+Instagram/i);
        if (m?.[1]) {
            const name = m[1].replace(/^@/, '').trim();
            if (name) return name;
        }
    }
    const usernameMatch = html.match(/"username"\s*:\s*"([A-Za-z0-9._]+)"/);
    if (usernameMatch?.[1] && usernameMatch[1] !== 'instagram') {
        return usernameMatch[1];
    }
    const ownerMatch = html.match(/"owner"\s*:\s*\{[^}]*"username"\s*:\s*"([A-Za-z0-9._]+)"/);
    if (ownerMatch?.[1]) return ownerMatch[1];
    return null;
}

function extractOgImage(html) {
    return metaContent(html, 'og:image') || metaContent(html, 'twitter:image') || null;
}

function looksLikeLoginWall(html) {
    const lower = html.toLowerCase();
    if (html.includes('httpErrorPage') || html.includes('PolarisErrorRoot')) return true;
    if (lower.includes('loginform') || lower.includes('/accounts/login')) return true;
    if (lower.includes('log in to instagram') && !extractCaptionFromHtml(html)) return true;
    return false;
}

function captionNeedsBioWarning(caption) {
    if (!caption) return false;
    return BIO_LINK_HINTS.some((re) => re.test(caption));
}

function buildImportText(caption) {
    const body = cleanCaption(caption);
    if (!body) return '';
    if (captionNeedsBioWarning(body)) {
        return (
            'Note: This Instagram caption may only point to a recipe in the bio or an external link—not the full recipe in the post.\n\n' +
            body
        );
    }
    return body;
}

export function buildInstagramImportPayload({ caption, image, author, sourceUrl }) {
    const text = buildImportText(caption);
    if (!text) return null;
    return {
        text,
        image: image || null,
        sourceUrl,
        author: author || null,
    };
}

/**
 * @returns {Promise<{ text: string, image: string | null, sourceUrl: string, author: string | null }>}
 */
export async function importInstagramPost(inputUrl) {
    const parsed = new URL(String(inputUrl).trim());
    const shortcode = extractInstagramShortcode(parsed.pathname);
    if (!shortcode) {
        throw new Error('invalid_instagram_url');
    }
    const sourceUrl = canonicalInstagramPostUrl(shortcode);
    const candidates = [sourceUrl, embedCaptionedUrl(shortcode)];
    if (parsed.toString() !== sourceUrl) {
        candidates.unshift(parsed.toString());
    }

    let best = { caption: '', image: null, author: null, loginWall: false };

    for (const fetchUrl of candidates) {
        try {
            const { html } = await safeFetchHtml(fetchUrl, { userAgent: MOBILE_UA });
            if (looksLikeLoginWall(html)) {
                best.loginWall = true;
                continue;
            }
            const caption = extractCaptionFromHtml(html);
            const author = extractAuthorFromHtml(html);
            const image = extractOgImage(html);
            if (caption.length > best.caption.length) {
                best = { caption, image, author, loginWall: false };
            } else if (!best.author && author) {
                best.author = author;
            } else if (!best.image && image) {
                best.image = image;
            }
            if (best.caption.length > 40) break;
        } catch {
            // try next candidate URL
        }
    }

    const payload = buildInstagramImportPayload({
        caption: best.caption,
        image: best.image,
        author: best.author,
        sourceUrl,
    });
    if (!payload) {
        if (best.loginWall) throw new Error('instagram_login_wall');
        throw new Error('instagram_no_caption');
    }
    return payload;
}
