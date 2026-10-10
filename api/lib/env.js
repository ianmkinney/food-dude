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

/** Primary owner account: OWNER_EMAIL or first entry in ALLOWED_EMAILS. */
export function getOwnerEmail() {
    const explicit = process.env.OWNER_EMAIL;
    if (explicit && String(explicit).trim()) {
        return String(explicit).trim().toLowerCase();
    }
    const allowed = getAllowedEmails();
    return allowed[0] || '';
}

let openRouterKeysCache = null;

/** @returns {Record<string, string>} lowercase email → sk-or-… */
export function getOpenRouterKeysByEmail() {
    if (openRouterKeysCache) return openRouterKeysCache;
    const raw = process.env.OPENROUTER_KEYS_JSON;
    if (!raw || !String(raw).trim()) {
        openRouterKeysCache = {};
        return openRouterKeysCache;
    }
    try {
        const parsed = JSON.parse(String(raw));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('OPENROUTER_KEYS_JSON must be a JSON object');
        }
        const out = {};
        for (const [email, key] of Object.entries(parsed)) {
            if (!email || typeof key !== 'string' || !key.trim()) continue;
            out[String(email).trim().toLowerCase()] = key.trim();
        }
        openRouterKeysCache = out;
        return out;
    } catch (error) {
        console.error('[env] OPENROUTER_KEYS_JSON parse failed:', error?.message || error);
        openRouterKeysCache = {};
        return openRouterKeysCache;
    }
}

/**
 * Resolve the OpenRouter API key for a signed-in allowlisted user.
 * Per-tester keys come from OPENROUTER_KEYS_JSON; the owner may use OPENROUTER_API_KEY.
 * @returns {string | null}
 */
export function resolveOpenRouterApiKey(email) {
    const normalized = String(email || '').toLowerCase();
    const fromMap = getOpenRouterKeysByEmail()[normalized];
    if (fromMap) return fromMap;

    const owner = getOwnerEmail();
    if (normalized === owner) {
        const fallback = process.env.OPENROUTER_API_KEY;
        if (fallback && String(fallback).trim()) return String(fallback).trim();
    }
    return null;
}

export function requireSecrets() {
    if (!process.env.SESSION_SECRET) {
        throw new Error('SESSION_SECRET is not set');
    }
}

export function getGoogleClientIds() {
    return splitCsv('GOOGLE_CLIENT_IDS');
}

// Tried in order when the configured model is rejected (OpenRouter retires IDs,
// e.g. google/gemini-2.0-flash-001). Override with OPENROUTER_FALLBACK_MODELS.
const BUILTIN_FALLBACK_MODELS = ['google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite'];

export function getOpenRouterConfig() {
    const allowed = splitCsv('OPENROUTER_ALLOWED_MODELS');
    const configuredFallbacks = splitCsv('OPENROUTER_FALLBACK_MODELS');
    const fallbackModels = configuredFallbacks.length ? configuredFallbacks : BUILTIN_FALLBACK_MODELS;
    const defaultModel =
        process.env.OPENROUTER_DEFAULT_MODEL ||
        allowed[0] ||
        fallbackModels[0];
    if (!allowed.length) {
        return { defaultModel, allowedModels: [defaultModel], fallbackModels };
    }
    return {
        defaultModel: allowed.includes(defaultModel) ? defaultModel : allowed[0],
        allowedModels: allowed,
        fallbackModels,
    };
}

export function estimateTokens(text) {
    return Math.max(1, Math.ceil(String(text || '').length / 4));
}
