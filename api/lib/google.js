const { getGoogleClientIds } = require('./env');

async function verifyGoogleIdToken(idToken) {
    const clientIds = getGoogleClientIds();
    if (!clientIds.length) {
        throw new Error('GOOGLE_CLIENT_IDS is not set');
    }

    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Invalid Google sign-in');
    }
    const data = await response.json();
    const aud = data.aud;
    if (!clientIds.includes(aud)) {
        throw new Error('Google client ID mismatch');
    }
    if (data.email_verified !== 'true' && data.email_verified !== true) {
        throw new Error('Google email not verified');
    }
    return {
        sub: data.sub,
        email: data.email,
        name: data.name || data.given_name || '',
    };
}

module.exports = { verifyGoogleIdToken };
