import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'metadata.goog',
]);

/**
 * @param {string} ip
 */
export function isBlockedIp(ip) {
    const kind = net.isIP(ip);
    if (!kind) return true;

    if (kind === 4) {
        const parts = ip.split('.').map((p) => Number(p));
        const [a, b] = parts;
        if (a === 0 || a === 10) return true;
        if (a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / shared address space
        if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
        if (a >= 224) return true; // multicast + reserved
        return false;
    }

    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('::ffff:')) {
        const mapped = lower.slice('::ffff:'.length);
        if (net.isIP(mapped) === 4) return isBlockedIp(mapped);
    }
    return false;
}

/**
 * @param {string} hostname
 */
export async function assertResolvablePublicHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
        throw new Error('blocked_host');
    }

    if (net.isIP(host)) {
        if (isBlockedIp(host)) throw new Error('blocked_ip');
        return;
    }

    let addresses;
    try {
        addresses = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
        throw new Error('dns_failed');
    }
    if (!addresses?.length) throw new Error('dns_failed');
    for (const entry of addresses) {
        if (isBlockedIp(entry.address)) throw new Error('blocked_ip');
    }
}

/**
 * @param {string} raw
 * @returns {URL}
 */
export function parseHttpUrl(raw) {
    let url;
    try {
        url = new URL(String(raw).trim());
    } catch {
        throw new Error('invalid_url');
    }
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
        throw new Error('invalid_protocol');
    }
    if (url.username || url.password) {
        throw new Error('invalid_url');
    }
    const port = url.port ? Number(url.port) : protocol === 'https:' ? 443 : 80;
    if (port !== 80 && port !== 443) {
        throw new Error('invalid_port');
    }
    if (!url.hostname) throw new Error('invalid_url');
    return url;
}

/**
 * @param {string} href
 */
export async function assertSafeHttpUrl(href) {
    const url = parseHttpUrl(href);
    await assertResolvablePublicHost(url.hostname);
    return url;
}
