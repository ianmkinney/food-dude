const { SignJWT, jwtVerify } = require('jose');

const SESSION_TTL = '2h';

function getSecretKey() {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        throw new Error('SESSION_SECRET is not set');
    }
    return new TextEncoder().encode(secret);
}

async function signSession({ sub, email, name }) {
    return new SignJWT({ email, name })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime(SESSION_TTL)
        .sign(getSecretKey());
}

async function verifySession(token) {
    const { payload } = await jwtVerify(token, getSecretKey());
    const sub = payload.sub;
    const email = payload.email;
    if (!sub || !email) {
        throw new Error('Invalid session');
    }
    return {
        sub: String(sub),
        email: String(email),
        name: payload.name ? String(payload.name) : '',
    };
}

function bearerToken(req) {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header || typeof header !== 'string') return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

module.exports = { signSession, verifySession, bearerToken };
