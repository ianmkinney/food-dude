import { createHash } from 'node:crypto';

/**
 * Implicit OAuth (`response_type=id_token`) echoes the raw nonce.
 * Google Identity Services One Tap may instead put the SHA-256 digest of that
 * nonce in the ID token (standard base64 or base64url, without requiring padding).
 * Audience and email_verified checks stay separate.
 */
export function googleNonceMatches(payloadNonce, expectedNonce) {
    if (typeof payloadNonce !== 'string' || typeof expectedNonce !== 'string') return false;
    if (!payloadNonce || !expectedNonce) return false;
    if (payloadNonce === expectedNonce) return true;
    const digest = createHash('sha256').update(expectedNonce, 'utf8').digest();
    const b64 = digest.toString('base64');
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return payloadNonce === b64 || payloadNonce === b64url;
}
