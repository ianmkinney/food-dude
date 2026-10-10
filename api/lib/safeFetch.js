import { assertSafeHttpUrl } from './ssrf.js';

const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class SafeFetchError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'SafeFetchError';
        this.code = code;
    }
}

/**
 * @param {Response} response
 * @param {number} maxBytes
 */
async function readBodyLimited(response, maxBytes) {
    if (!response.body) {
        const text = await response.text();
        if (text.length > maxBytes) throw new SafeFetchError('response_too_large', 'Page too large');
        return text;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            try {
                await reader.cancel();
            } catch {
                // ignore
            }
            throw new SafeFetchError('response_too_large', 'Page too large');
        }
        chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

/**
 * Fetch HTML with SSRF checks on every redirect hop.
 * @param {string} startUrl
 * @param {{ timeoutMs?: number, maxBytes?: number, maxRedirects?: number, userAgent?: string }} [opts]
 */
export async function fetchHtmlSafe(startUrl, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 8000;
    const maxBytes = opts.maxBytes ?? 3 * 1024 * 1024;
    const maxRedirects = opts.maxRedirects ?? 3;
    const userAgent = opts.userAgent ?? DEFAULT_UA;

    let current = String(startUrl).trim();
    let redirects = 0;

    while (true) {
        await assertSafeHttpUrl(current);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(current, {
                method: 'GET',
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'User-Agent': userAgent,
                    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new SafeFetchError('timeout', 'Request timed out');
            }
            throw new SafeFetchError('fetch_failed', error?.message || 'Fetch failed');
        } finally {
            clearTimeout(timer);
        }

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) {
                throw new SafeFetchError('site_blocked', 'Redirect without location');
            }
            redirects += 1;
            if (redirects > maxRedirects) {
                throw new SafeFetchError('site_blocked', 'Too many redirects');
            }
            current = new URL(location, current).href;
            continue;
        }

        if (response.status === 401 || response.status === 403) {
            throw new SafeFetchError('site_blocked', `HTTP ${response.status}`);
        }
        if (!response.ok) {
            throw new SafeFetchError('fetch_failed', `HTTP ${response.status}`);
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            throw new SafeFetchError('not_html', 'URL did not return HTML');
        }

        const html = await readBodyLimited(response, maxBytes);
        return { html, finalUrl: current };
    }
}
