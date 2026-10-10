import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getGoogleClientIds } from './env.js';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function verifyGoogleIdToken(idToken, expectedNonce) {
    const clientIds = getGoogleClientIds();
    if (!clientIds.length) {
        throw new Error('GOOGLE_CLIENT_IDS is not set');
    }
    if (!expectedNonce || typeof expectedNonce !== 'string') {
        throw new Error('Missing nonce');
    }

    let payload;
    try {
        const result = await jwtVerify(idToken, GOOGLE_JWKS, {
            issuer: ['https://accounts.google.com', 'accounts.google.com'],
            audience: clientIds,
        });
        payload = result.payload;
    } catch (error) {
        console.error('[google] id_token verify failed:', error?.message || error);
        throw new Error('Invalid Google sign-in');
    }

    if (payload.nonce !== expectedNonce) {
        throw new Error('Invalid Google sign-in nonce');
    }
    if (payload.email_verified !== true) {
        throw new Error('Google email not verified');
    }
    const email = payload.email;
    const sub = payload.sub;
    if (!email || !sub) {
        throw new Error('Invalid Google sign-in');
    }

    return {
        sub: String(sub),
        email: String(email),
        name: payload.name ? String(payload.name) : payload.given_name ? String(payload.given_name) : '',
    };
}
