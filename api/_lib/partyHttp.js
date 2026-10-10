export const PARTY_MSG = {
    method_not_allowed: 'Method not allowed.',
    method_not_allowed_alt: 'Method not allowed.',
    misconfigured: 'Party sync is not configured on the server.',
    unauthorized: 'Sign in again in Account.',
    not_allowed: 'This Google account is not authorized.',
    forbidden: 'You do not have access to this party.',
    rate_limited: 'Too many requests. Wait a moment and try again.',
    bad_request: 'Invalid request.',
    not_found: 'Party not found.',
    conflict: 'Request could not be completed.',
};

export function partyReject(res, status, error, extra = {}) {
    res.status(status).json({ error, message: PARTY_MSG[error] || 'Request failed.', ...extra });
}

export function memberTokenFromReq(req) {
    const header = req.headers['x-party-member-token'];
    if (header && typeof header === 'string') return header.trim();
    const body = req.body?.memberToken;
    return body ? String(body).trim() : '';
}
