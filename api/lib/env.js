/** @returns {string[]} */
function splitCsv(name) {
    const raw = process.env[name];
    if (!raw || !String(raw).trim()) return [];
    return String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Mandatory owner allowlist. Empty when unset — proxy must refuse all use. */
export function getAllowedEmails() {
    return splitCsv('ALLOWED_EMAILS').map((e) => e.toLowerCase());
}

export function isOwnerGateConfigured() {
    return getAllowedEmails().length > 0;
}

export function isEmailAllowed(email) {
    const allowed = getAllowedEmails();
    if (!allowed.length) return false;
    return allowed.includes(String(email || '').toLowerCase());
}

export function requireSecrets() {
    if (!process.env.SESSION_SECRET) {
        throw new Error('SESSION_SECRET is not set');
    }
    if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY is not set');
    }
}

export function getGoogleClientIds() {
    return splitCsv('GOOGLE_CLIENT_IDS');
}

export function getOpenRouterConfig() {
    const allowed = splitCsv('OPENROUTER_ALLOWED_MODELS');
    const defaultModel =
        process.env.OPENROUTER_DEFAULT_MODEL ||
        allowed[0] ||
        'google/gemini-2.0-flash-001';
    if (!allowed.length) {
        return { defaultModel, allowedModels: [defaultModel] };
    }
    return {
        defaultModel: allowed.includes(defaultModel) ? defaultModel : allowed[0],
        allowedModels: allowed,
    };
}

export function getDailyLimits() {
    return {
        maxRequests: Math.max(1, Number(process.env.PLATFORM_AI_DAILY_REQUESTS || 500)),
        maxTokens: Math.max(1000, Number(process.env.PLATFORM_AI_DAILY_TOKEN_BUDGET || 500000)),
    };
}

export function estimateTokens(text) {
    return Math.max(1, Math.ceil(String(text || '').length / 4));
}
