/**
 * Media type detection for AI uploads.
 *
 * Providers validate the media type we declare against the actual bytes we send.
 * Gemini tolerated a wrong `mimeType`; Anthropic rejects the request with a 400,
 * so every upload path has to report the real format instead of assuming JPEG.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Formats every provider accepts, used as the conversion target.
export const FALLBACK_IMAGE_MIME_TYPE = 'image/jpeg';

export const PROVIDER_IMAGE_MIME_SUPPORT = {
    anthropic: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    openai: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    xai: ['image/jpeg', 'image/png'],
    gemini: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'],
};

export const PROVIDER_VIDEO_MIME_SUPPORT = {
    gemini: [
        'video/mp4',
        'video/mpeg',
        'video/quicktime',
        'video/webm',
        'video/3gpp',
        'video/x-flv',
        'video/x-ms-wmv',
        'video/x-msvideo',
    ],
};

const EXTENSION_MIME_TYPES = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jpe: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    avif: 'image/avif',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mpeg: 'video/mpeg',
    mpg: 'video/mpeg',
    avi: 'video/x-msvideo',
    '3gp': 'video/3gpp',
    flv: 'video/x-flv',
    wmv: 'video/x-ms-wmv',
};

const MIME_ALIASES = {
    'image/jpg': 'image/jpeg',
    'image/pjpeg': 'image/jpeg',
    'image/x-png': 'image/png',
    'image/heic-sequence': 'image/heic',
    'image/heif-sequence': 'image/heif',
    'video/mov': 'video/quicktime',
    'video/x-quicktime': 'video/quicktime',
};

// ISO base media file format brands, which share a container with MP4.
const HEIC_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs'];
const HEIF_BRANDS = ['mif1', 'msf1', 'heif'];
const MP4_BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'mmp4', 'm4v ', 'm4a ', 'dash'];

export function normalizeMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') return null;
    const cleaned = mimeType.split(';')[0].trim().toLowerCase();
    if (!cleaned || !cleaned.includes('/')) return null;
    return MIME_ALIASES[cleaned] || cleaned;
}

/**
 * Decode the leading bytes of a base64 payload so magic bytes can be inspected.
 */
export function decodeBase64Prefix(base64, byteCount = 16) {
    const raw = String(base64 || '')
        .replace(/^data:[^,]*,/, '')
        .replace(/\s+/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < raw.length && bytes.length < byteCount; i += 1) {
        const value = BASE64_ALPHABET.indexOf(raw[i]);
        if (value < 0) break;
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
        }
    }
    return bytes;
}

function ascii(bytes, offset, length) {
    let out = '';
    for (let i = offset; i < offset + length; i += 1) {
        const byte = bytes[i];
        if (byte === undefined) return out;
        out += String.fromCharCode(byte);
    }
    return out;
}

function startsWithBytes(bytes, signature) {
    return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Identify a media type from the actual bytes. Returns null when unrecognized.
 */
export function sniffMimeFromBase64(base64) {
    const bytes = decodeBase64Prefix(base64, 16);
    if (bytes.length < 4) return null;

    if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
    if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (ascii(bytes, 0, 3) === 'GIF') return 'image/gif';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
    if (ascii(bytes, 0, 2) === 'BM') return 'image/bmp';
    if (startsWithBytes(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWithBytes(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
        return 'image/tiff';
    }

    if (ascii(bytes, 4, 4) === 'ftyp') {
        const brand = ascii(bytes, 8, 4).toLowerCase();
        if (HEIC_BRANDS.includes(brand)) return 'image/heic';
        if (HEIF_BRANDS.includes(brand)) return 'image/heif';
        if (brand === 'avif' || brand === 'avis') return 'image/avif';
        if (brand.startsWith('qt')) return 'video/quicktime';
        if (MP4_BRANDS.includes(brand)) return 'video/mp4';
        if (brand.startsWith('3g')) return 'video/3gpp';
        return 'video/mp4';
    }

    return null;
}

export function mimeTypeFromFileName(nameOrUri) {
    if (!nameOrUri || typeof nameOrUri !== 'string') return null;
    const withoutQuery = nameOrUri.split(/[?#]/)[0];
    const match = withoutQuery.match(/\.([a-z0-9]+)$/i);
    if (!match) return null;
    return EXTENSION_MIME_TYPES[match[1].toLowerCase()] || null;
}

/**
 * Resolve an image's media type, trusting the bytes over anything the picker or
 * share intent declared.
 */
export function resolveImageMimeType({ base64, mimeType, uri, fileName } = {}) {
    const sniffed = normalizeMimeType(sniffMimeFromBase64(base64));
    if (sniffed?.startsWith('image/')) return sniffed;

    const declared = normalizeMimeType(mimeType);
    if (declared?.startsWith('image/')) return declared;

    const fromName = normalizeMimeType(mimeTypeFromFileName(fileName) || mimeTypeFromFileName(uri));
    if (fromName?.startsWith('image/')) return fromName;

    return sniffed || null;
}

export function resolveVideoMimeType({ base64, mimeType, uri, fileName } = {}) {
    const sniffed = normalizeMimeType(sniffMimeFromBase64(base64));
    if (sniffed?.startsWith('video/')) return sniffed;

    const declared = normalizeMimeType(mimeType);
    if (declared?.startsWith('video/')) return declared;

    const fromName = normalizeMimeType(mimeTypeFromFileName(fileName) || mimeTypeFromFileName(uri));
    if (fromName?.startsWith('video/')) return fromName;

    return sniffed || null;
}

export function isImageMimeSupportedBy(provider, mimeType) {
    const normalized = normalizeMimeType(mimeType);
    if (!normalized) return false;
    const supported = PROVIDER_IMAGE_MIME_SUPPORT[provider] || SUPPORTED_IMAGE_MIME_TYPES;
    return supported.includes(normalized);
}

export function isVideoMimeSupportedBy(provider, mimeType) {
    const normalized = normalizeMimeType(mimeType);
    if (!normalized) return false;
    const supported = PROVIDER_VIDEO_MIME_SUPPORT[provider];
    return Boolean(supported?.includes(normalized));
}

export function describeMimeType(mimeType) {
    const normalized = normalizeMimeType(mimeType);
    if (!normalized) return 'that file type';
    return normalized.replace(/^image\/|^video\//, '').toUpperCase();
}

const FORMAT_ERROR_PATTERNS = [
    /media[_ ]type/i,
    /image\.source/i,
    /invalid[_ ]image/i,
    /unsupported image/i,
    /could not process image/i,
    /image format/i,
    /base64/i,
];

/**
 * Turn provider validation noise into something a cook can act on. The raw text
 * stays in the console for debugging.
 */
export function friendlyMediaErrorMessage(rawMessage) {
    const message = typeof rawMessage === 'string' ? rawMessage : rawMessage?.message || '';
    if (!message) return 'Something went wrong reading that image. Try another screenshot.';
    if (FORMAT_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
        return "That image format isn't supported. Try a screenshot or photo (PNG/JPEG).";
    }
    return message;
}
