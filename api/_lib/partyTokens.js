import { createHash, randomBytes } from 'node:crypto';

export function generateToken(bytes = 32) {
    return randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
    return createHash('sha256').update(String(token)).digest('hex');
}

export function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
