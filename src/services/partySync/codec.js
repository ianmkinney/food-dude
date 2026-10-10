import { deflate, inflate } from 'fflate';
import * as Crypto from 'expo-crypto';
import { base64urlDecode, base64urlEncode } from '../../utils/base64url';
import { hmacSha256Base64Url, timingSafeEqual } from '../../utils/hmacSha256';

export const PARTY_LINK_BASE = 'https://amplifood.vercel.app/party';
export const PARTY_PAYLOAD_FORMAT = 1;
export const MAX_EMAIL_LINK_BYTES = 8 * 1024;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function deflateAsync(bytes) {
    return new Promise((resolve, reject) => {
        deflate(bytes, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

function inflateAsync(bytes) {
    return new Promise((resolve, reject) => {
        inflate(bytes, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

export function generatePartyUuid() {
    const bytes = Crypto.getRandomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateSyncSecret() {
    return base64urlEncode(Crypto.getRandomBytes(32));
}

/**
 * @param {object} payload Party export object (format, uuid, …)
 * @param {string} secret per-party sync secret
 */
export async function encodeSignedPartyPayload(payload, secret) {
    const json = JSON.stringify(payload);
    const compressed = await deflateAsync(textEncoder.encode(json));
    const p = base64urlEncode(compressed);
    const sig = await hmacSha256Base64Url(secret, p);
    return { p, sig };
}

/**
 * @param {{ p: string, sig: string, secret: string }} parts
 * @returns {Promise<object>} parsed payload
 */
export async function decodeSignedPartyPayload({ p, sig, secret }) {
    const expected = await hmacSha256Base64Url(secret, p);
    if (!timingSafeEqual(expected, sig)) {
        throw new Error('Party link signature is invalid or the link was tampered with.');
    }
    const compressed = base64urlDecode(p);
    const jsonBytes = await inflateAsync(compressed);
    const parsed = JSON.parse(textDecoder.decode(jsonBytes));
    if (parsed?.format !== PARTY_PAYLOAD_FORMAT) {
        throw new Error('Unsupported party link format.');
    }
    return parsed;
}

/**
 * @param {{ p: string, sig: string, s: string }} fragmentParams
 */
export function buildPartyShareUrl({ p, sig, s }) {
    const params = new URLSearchParams();
    params.set('p', p);
    params.set('sig', sig);
    params.set('s', s);
    return `${PARTY_LINK_BASE}#${params.toString()}`;
}

/** Parse `window.location.hash` or `#p=…&sig=…&s=…` */
export function parsePartyHash(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const p = params.get('p');
    const sig = params.get('sig');
    const s = params.get('s');
    if (!p || !sig || !s) return null;
    return { p, sig, s, secret: s };
}

export function stripHeavyPartyFields(payload) {
    const clone = JSON.parse(JSON.stringify(payload));
    if (Array.isArray(clone.meals)) {
        clone.meals = clone.meals.map((meal) => {
            const { image, images, photo, photos, ...rest } = meal;
            return rest;
        });
    }
    return clone;
}

export async function buildShareLinkForPayload(payload, secret, { stripHeavy = false } = {}) {
    let body = payload;
    let link = '';
    for (let attempt = 0; attempt < 3; attempt++) {
        const { p, sig } = await encodeSignedPartyPayload(body, secret);
        link = buildPartyShareUrl({ p, sig, s: secret });
        if (link.length <= MAX_EMAIL_LINK_BYTES) {
            return link;
        }
        if (!stripHeavy && attempt === 0) {
            body = stripHeavyPartyFields(body);
            stripHeavy = true;
            continue;
        }
        if (attempt === 1 && Array.isArray(body.meals)) {
            body = {
                ...body,
                meals: body.meals.map((m) => ({
                    id: m.id,
                    name: m.name,
                    recipeIds: m.recipeIds || [],
                })),
            };
            continue;
        }
        break;
    }
    return link;
}
