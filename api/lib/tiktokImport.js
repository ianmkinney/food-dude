import { safeFetchBinary, safeFetchHtml } from './ssrf.js';
import { metaContent } from './recipeExtract.js';
import { runVideoRecipeExtraction } from './importVideoShared.js';
import {
    extractSubtitleUrlsFromHtml,
    fetchSubtitleText,
    looksLikeFullRecipe,
} from './instagramImport.js';

const MOBILE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';

const TIKTOK_HOST_RE = /(^|\.)tiktok\.com$/i;

function cleanText(text) {
    if (!text) return '';
    return String(text).replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim();
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

export function isTikTokHost(hostname) {
    const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase().replace(/^www\./, '');
    return TIKTOK_HOST_RE.test(host);
}

export function isTikTokPostUrl(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl).trim());
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return true;
        if (!isTikTokHost(host)) return false;
        return /\/@[^/]+\/video\/\d+/i.test(parsed.pathname) || /\/video\/\d+/i.test(parsed.pathname) || /\/t\/\w+/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

function assertTikTokFinalUrl(url) {
    const parsed = new URL(url);
    if (!isTikTokHost(parsed.hostname)) {
        throw new Error('invalid_tiktok_url');
    }
}

/**
 * Resolve vm/vt short links to a canonical tiktok.com video URL (SSRF-safe redirects).
 */
export async function resolveTikTokUrl(inputUrl) {
    const trimmed = String(inputUrl).trim();
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error('invalid_tiktok_url');
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || !/\/video\//i.test(parsed.pathname)) {
        const { finalUrl } = await safeFetchHtml(trimmed, { userAgent: MOBILE_UA });
        assertTikTokFinalUrl(finalUrl);
        return finalUrl;
    }
    assertTikTokFinalUrl(trimmed);
    return trimmed;
}

async function fetchTikTokOembed(pageUrl) {
    const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(pageUrl)}`;
    let response;
    try {
        response = await fetch(endpoint, {
            headers: { 'User-Agent': MOBILE_UA, Accept: 'application/json' },
        });
    } catch {
        throw new Error('tiktok_oembed_failed');
    }
    if (!response.ok) throw new Error('tiktok_oembed_failed');
    return response.json();
}

function parseUniversalData(html) {
    const match = html.match(
        /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (!match?.[1]) return null;
    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

function walkForItemStruct(node, found = []) {
    if (!node) return found;
    if (Array.isArray(node)) {
        for (const item of node) walkForItemStruct(item, found);
        return found;
    }
    if (typeof node !== 'object') return found;
    if (node.itemStruct && typeof node.itemStruct === 'object') {
        found.push(node.itemStruct);
    }
    if (node.desc && node.id && (node.video || node.author)) {
        found.push(node);
    }
    for (const value of Object.values(node)) {
        if (value && typeof value === 'object') walkForItemStruct(value, found);
    }
    return found;
}

function pickBestItemStruct(universal) {
    const items = walkForItemStruct(universal);
    if (!items.length) return null;
    items.sort((a, b) => String(b.desc || '').length - String(a.desc || '').length);
    return items[0];
}

function extractDescFromStruct(item) {
    if (!item) return '';
    return cleanText(item.desc || item.title || item.description || '');
}

function extractAuthorFromStruct(item, oembed) {
    if (item?.author?.uniqueId) return String(item.author.uniqueId);
    if (item?.author?.nickname) return String(item.author.nickname);
    if (oembed?.author_name) return String(oembed.author_name).replace(/^@/, '');
    return null;
}

function extractVideoUrlFromStruct(item, html) {
    const fromItem = item?.video?.playAddr || item?.video?.downloadAddr;
    if (fromItem) {
        const url = decodeJsonString(String(fromItem)).replace(/\\u0026/g, '&');
        if (url.startsWith('http')) return url;
    }
    const patterns = [
        /"playAddr"\s*:\s*"([^"]+)"/g,
        /"downloadAddr"\s*:\s*"([^"]+)"/g,
        /"playApi"\s*:\s*"([^"]+)"/g,
    ];
    for (const re of patterns) {
        for (const match of html.matchAll(re)) {
            const url = decodeJsonString(match[1]).replace(/\\u0026/g, '&');
            if (url.startsWith('http') && (url.includes('tiktok') || url.includes('.mp4'))) {
                return url;
            }
        }
    }
    return null;
}

function extractSubtitleUrlsFromStruct(item) {
    const urls = [];
    const infos = item?.video?.subtitleInfos || item?.video?.claInfo?.captionInfos;
    const list = Array.isArray(infos) ? infos : infos ? [infos] : [];
    for (const info of list) {
        const url = info?.Url || info?.url || info?.captionUrl;
        if (url && String(url).startsWith('http')) urls.push(String(url));
    }
    return urls;
}

async function buildTikTokTextBundle({ html, oembed, item }) {
    const sections = [];
    if (oembed?.title) sections.push(cleanText(oembed.title));
    const desc = extractDescFromStruct(item);
    if (desc && !sections.includes(desc)) sections.push(desc);
    pushOgDescriptions(html, sections);
    const subUrls = [...extractSubtitleUrlsFromStruct(item), ...extractSubtitleUrlsFromHtml(html)];
    const seen = new Set();
    for (const subUrl of subUrls) {
        if (seen.has(subUrl)) continue;
        seen.add(subUrl);
        const subText = await fetchSubtitleText(subUrl);
        if (subText) sections.push(`[Captions track]\n${subText}`);
        if (seen.size >= 3) break;
    }
    return cleanText(sections.filter(Boolean).join('\n\n---\n\n'));
}

function pushOgDescriptions(html, sections) {
    const og = metaContent(html, 'og:description');
    const twitter = metaContent(html, 'twitter:description');
    for (const piece of [og, twitter]) {
        const t = cleanText(piece);
        if (t && !sections.includes(t)) sections.push(t);
    }
}

function buildTextPayload({ text, image, author, sourceUrl }) {
    const body = cleanText(text);
    if (!body) return null;
    return { text: body, image: image || null, sourceUrl, author: author || null };
}

/**
 * @param {{ apiKey?: string, onHeavyRateLimit?: () => boolean }} options
 */
export async function importTikTokPost(inputUrl, options = {}) {
    const sourceUrl = await resolveTikTokUrl(inputUrl);

    let oembed = null;
    try {
        oembed = await fetchTikTokOembed(sourceUrl);
    } catch {
        // continue with page HTML only
    }

    let html = '';
    let item = null;
    try {
        const fetched = await safeFetchHtml(sourceUrl, { userAgent: MOBILE_UA });
        html = fetched.html;
        item = pickBestItemStruct(parseUniversalData(html));
    } catch {
        if (!oembed?.title) throw new Error('tiktok_no_caption');
    }

    const bundle = await buildTikTokTextBundle({ html, oembed, item });
    const author = extractAuthorFromStruct(item, oembed);
    const image = oembed?.thumbnail_url || metaContent(html, 'og:image');
    const videoUrl = extractVideoUrlFromStruct(item, html);

    if (looksLikeFullRecipe(bundle)) {
        const payload = buildTextPayload({ text: bundle, image, author, sourceUrl });
        if (payload) return payload;
    }

    const partial = cleanText(bundle);
    if (partial && options.apiKey && videoUrl) {
        if (options.onHeavyRateLimit && !options.onHeavyRateLimit()) {
            throw new Error('rate_limited');
        }
        try {
            const { buffer, contentType } = await safeFetchBinary(videoUrl, {
                maxBytes: 25 * 1024 * 1024,
                timeoutMs: 180_000,
                userAgent: MOBILE_UA,
            });
            const mimeType = contentType.split(';')[0].trim() || 'video/mp4';
            return await runVideoRecipeExtraction({
                apiKey: options.apiKey,
                mimeType,
                base64: buffer.toString('base64'),
                extraContext: partial || `TikTok by @${author || 'unknown'}`,
                meta: { sourceUrl, sourcePlatform: 'tiktok', author },
            });
        } catch (error) {
            console.warn('[tiktokImport] video extract failed:', error?.message || error);
        }
    }

    const payload = buildTextPayload({ text: bundle, image, author, sourceUrl });
    if (!payload) throw new Error('tiktok_no_caption');
    return payload;
}
