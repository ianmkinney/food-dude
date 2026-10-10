import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'metadata.google',
]);

function isPrivateOrReservedIp(ip) {
    if (!ip) return true;
    const kind = net.isIP(ip);
    if (kind === 4) {
        const parts = ip.split('.').map((p) => Number(p));
        const [a, b] = parts;
        if (a === 127) return true;
        if (a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
        if (a === 0) return true;
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / shared address space
        if (a >= 224) return true; // multicast + reserved
        return false;
    }
    if (kind === 6) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return true;
        if (lower.startsWith('fe80:')) return true; // link-local
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
        if (lower.startsWith('ff')) return true; // multicast
        if (lower.startsWith('::ffff:')) {
            const mapped = lower.slice('::ffff:'.length);
            if (net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
        }
        return false;
    }
    return true;
}

export function assertStandardPort(url) {
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    if (port !== 80 && port !== 443) {
        throw new Error('non_standard_port');
    }
}

export function assertHttpOrHttpsUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        throw new Error('invalid_url');
    }
    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch {
        throw new Error('invalid_url');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('invalid_protocol');
    }
    if (parsed.username || parsed.password) {
        throw new Error('invalid_url');
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!host || BLOCKED_HOSTNAMES.has(host)) {
        throw new Error('blocked_host');
    }
    if (host.endsWith('.localhost') || host.endsWith('.local')) {
        throw new Error('blocked_host');
    }
    assertStandardPort(parsed);
    return parsed;
}

async function resolveHostAddresses(hostname) {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (net.isIP(host)) {
        return [host];
    }
    const results = await dns.lookup(host, { all: true, verbatim: true });
    const ips = results.map((r) => r.address).filter(Boolean);
    if (!ips.length) {
        throw new Error('dns_failed');
    }
    return ips;
}

export async function assertSafeUrl(parsedUrl) {
    const host = parsedUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (net.isIP(host)) {
        if (isPrivateOrReservedIp(host)) throw new Error('blocked_ip');
        return;
    }
    if (BLOCKED_HOSTNAMES.has(host)) throw new Error('blocked_host');
    const ips = await resolveHostAddresses(host);
    for (const ip of ips) {
        if (isPrivateOrReservedIp(ip)) throw new Error('blocked_ip');
    }
}

const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

/**
 * Fetch a public recipe page with SSRF checks on every hop.
 * @returns {Promise<{ finalUrl: string, html: string, contentType: string }>}
 */
export async function safeFetchHtml(startUrl) {
    let current = assertHttpOrHttpsUrl(startUrl);
    await assertSafeUrl(current);

    let redirects = 0;
    while (true) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let response;
        try {
            response = await fetch(current.toString(), {
                method: 'GET',
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'User-Agent': BROWSER_UA,
                    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
        } catch (error) {
            clearTimeout(timer);
            if (error?.name === 'AbortError') throw new Error('timeout');
            throw new Error('fetch_failed');
        } finally {
            clearTimeout(timer);
        }

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) throw new Error('fetch_failed');
            if (redirects >= MAX_REDIRECTS) throw new Error('too_many_redirects');
            redirects += 1;
            const next = new URL(location, current);
            current = assertHttpOrHttpsUrl(next.toString());
            await assertSafeUrl(current);
            continue;
        }

        if (!response.ok) {
            throw new Error('fetch_failed');
        }

        const contentType = response.headers.get('content-type') || '';
        const reader = response.body?.getReader();
        if (!reader) {
            const text = await response.text();
            if (text.length > MAX_BYTES) throw new Error('response_too_large');
            return { finalUrl: current.toString(), html: text, contentType };
        }

        const chunks = [];
        let total = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_BYTES) {
                reader.cancel().catch(() => {});
                throw new Error('response_too_large');
            }
            chunks.push(value);
        }
        const html = Buffer.concat(chunks).toString('utf8');
        return { finalUrl: current.toString(), html, contentType };
    }
}
