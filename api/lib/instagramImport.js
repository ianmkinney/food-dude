import { safeFetchBinary, safeFetchHtml } from './ssrf.js';
import { metaContent } from './recipeExtract.js';
import { runVideoRecipeExtraction } from './importVideoShared.js';

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

function pushUnique(parts, text) {
    const cleaned = cleanCaption(text);
    if (!cleaned || isGenericDescription(cleaned)) return;
    if (!parts.some((p) => p === cleaned || p.includes(cleaned) || cleaned.includes(p))) {
        parts.push(cleaned);
    }
}

export function extractAllCaptionsFromHtml(html) {
    const parts = [];
    pushUnique(parts, metaContent(html, 'og:description'));
    pushUnique(parts, metaContent(html, 'twitter:description'));

    const patterns = [
        /"edge_media_to_caption":\s*\{\s*"edges":\s*\[\s*\{\s*"node":\s*\{\s*"text":\s*"((?:\\.|[^"\\])*)"/g,
        /"caption":\s*\{\s*"text":\s*"((?:\\.|[^"\\])*)"/g,
        /"caption":\s*"((?:\\.|[^"\\])*)"/g,
        /"accessibility_caption":\s*"((?:\\.|[^"\\])*)"/g,
        /"alt_text":\s*"((?:\\.|[^"\\])*)"/g,
    ];
    for (const re of patterns) {
        for (const match of html.matchAll(re)) {
            if (match[1]) pushUnique(parts, decodeJsonString(match[1]));
        }
    }
    return parts;
}

/** @deprecated use extractAllCaptionsFromHtml */
export function extractCaptionFromHtml(html) {
    return extractAllCaptionsFromHtml(html)[0] || '';
}

function parseVttToText(vtt) {
    const lines = String(vtt || '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('WEBVTT') && !/^\d+$/.test(l) && !l.includes('-->'));
    return cleanCaption(lines.join('\n'));
}

function parseSrtToText(srt) {
    return parseVttToText(srt.replace(/^\d+\s*$/gm, ''));
}

export function extractSubtitleUrlsFromHtml(html) {
    const urls = new Set();
    const patterns = [
        /"(?:captions_uri|video_subtitles_uri|subtitle_uri|closed_captions_uri)"\s*:\s*"([^"]+)"/g,
        /"(https:[^"]+\.vtt[^"]*)"/g,
        /"(https:[^"]+\.srt[^"]*)"/g,
    ];
    for (const re of patterns) {
        for (const match of html.matchAll(re)) {
            const raw = decodeJsonString(match[1]);
            if (raw.startsWith('http')) urls.add(raw);
        }
    }
    return [...urls];
}

export async function fetchSubtitleText(url) {
    try {
        const { buffer, contentType } = await safeFetchBinary(url, {
            maxBytes: 512 * 1024,
            timeoutMs: 15_000,
            userAgent: MOBILE_UA,
        });
        const text = buffer.toString('utf8');
        if (contentType.includes('json')) {
            const json = JSON.parse(text);
            const body = json?.caption || json?.text || json?.subtitles;
            if (typeof body === 'string') return parseVttToText(body);
        }
        if (url.includes('.srt') || text.includes(' --> ')) return parseSrtToText(text);
        return parseVttToText(text);
    } catch {
        return '';
    }
}

export async function buildInstagramTextBundle(html) {
    const sections = [];
    const captions = extractAllCaptionsFromHtml(html);
    if (captions.length) {
        sections.push(captions.join('\n\n'));
    }
    const subUrls = extractSubtitleUrlsFromHtml(html);
    for (const subUrl of subUrls.slice(0, 3)) {
        const subText = await fetchSubtitleText(subUrl);
        if (subText) sections.push(`[Captions track]\n${subText}`);
    }
    return cleanCaption(sections.join('\n\n---\n\n'));
}

export function looksLikeFullRecipe(text) {
    const body = cleanCaption(text);
    if (!body || body.length < 60) return false;
    if (captionNeedsBioWarning(body) && !/\b\d+\s*(cup|tbsp|tsp|oz|g|ml)\b/i.test(body)) {
        return false;
    }
    const lower = body.toLowerCase();
    const hasIngredients =
        /\bingredients?\b/i.test(body) ||
        /^\s*[-•*]\s*.+/m.test(body) ||
        /\b\d+[\d./]*\s*(cup|cups|tbsp|tsp|oz|lb|g|ml)\b/i.test(body);
    const hasSteps =
        /\b(instructions?|directions?|steps?)\b/i.test(body) ||
        /\b\d+\.\s+\w/m.test(body) ||
        /\b(bake|simmer|mix|stir|combine|heat|add)\b/i.test(lower);
    const lineCount = body.split('\n').filter((l) => l.trim().length > 4).length;
    return hasIngredients && hasSteps && lineCount >= 3;
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

export function extractVideoUrlFromHtml(html) {
    const candidates = [];
    const patterns = [
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/g,
        /"playback_url"\s*:\s*"([^"]+)"/g,
        /"url"\s*:\s*"(https:[^"]+\.mp4[^"]*)"/g,
    ];
    for (const re of patterns) {
        for (const match of html.matchAll(re)) {
            const url = decodeJsonString(match[1]).replace(/\\u0026/g, '&');
            if (url.startsWith('http') && (url.includes('.mp4') || url.includes('video'))) {
                candidates.push(url);
            }
        }
    }
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0] || null;
}

function looksLikeLoginWall(html) {
    const lower = html.toLowerCase();
    if (html.includes('httpErrorPage') || html.includes('PolarisErrorRoot')) return true;
    if (lower.includes('loginform') || lower.includes('/accounts/login')) return true;
    if (lower.includes('log in to instagram') && !extractAllCaptionsFromHtml(html).length) return true;
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
 * @param {{ apiKey?: string, onHeavyRateLimit?: () => boolean }} options
 */
export async function importInstagramPost(inputUrl, options = {}) {
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

    let bestHtml = '';
    let best = { bundle: '', image: null, author: null, loginWall: false, videoUrl: null };

    for (const fetchUrl of candidates) {
        try {
            const { html } = await safeFetchHtml(fetchUrl, { userAgent: MOBILE_UA });
            if (looksLikeLoginWall(html)) {
                best.loginWall = true;
                continue;
            }
            const bundle = await buildInstagramTextBundle(html);
            const author = extractAuthorFromHtml(html);
            const image = extractOgImage(html);
            const videoUrl = extractVideoUrlFromHtml(html);
            if (bundle.length > best.bundle.length) {
                best = { bundle, image, author, loginWall: false, videoUrl };
                bestHtml = html;
            } else if (!best.author && author) {
                best.author = author;
            } else if (!best.image && image) {
                best.image = image;
            } else if (!best.videoUrl && videoUrl) {
                best.videoUrl = videoUrl;
            }
            if (best.bundle.length > 80) break;
        } catch {
            // try next candidate URL
        }
    }

    if (!bestHtml && best.loginWall) {
        throw new Error('instagram_login_wall');
    }

    if (looksLikeFullRecipe(best.bundle)) {
        const payload = buildInstagramImportPayload({
            caption: best.bundle,
            image: best.image,
            author: best.author,
            sourceUrl,
        });
        if (payload) return payload;
    }

    const partialText = buildImportText(best.bundle);
    if (partialText && options.apiKey && best.videoUrl) {
        if (options.onHeavyRateLimit && !options.onHeavyRateLimit()) {
            throw new Error('rate_limited');
        }
        try {
            const { buffer, contentType } = await safeFetchBinary(best.videoUrl, {
                maxBytes: 25 * 1024 * 1024,
                timeoutMs: 180_000,
                userAgent: MOBILE_UA,
            });
            const mimeType = contentType.split(';')[0].trim() || 'video/mp4';
            const base64 = buffer.toString('base64');
            const structured = await runVideoRecipeExtraction({
                apiKey: options.apiKey,
                mimeType,
                base64,
                extraContext: partialText || `Instagram post by @${best.author || 'unknown'}`,
                meta: {
                    sourceUrl,
                    sourcePlatform: 'instagram',
                    author: best.author,
                },
            });
            return structured;
        } catch (error) {
            console.warn('[instagramImport] video extract failed:', error?.message || error);
            if (partialText) {
                return buildInstagramImportPayload({
                    caption: best.bundle,
                    image: best.image,
                    author: best.author,
                    sourceUrl,
                });
            }
        }
    }

    const payload = buildInstagramImportPayload({
        caption: best.bundle,
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
