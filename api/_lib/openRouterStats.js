const CREDITS_URL = 'https://openrouter.ai/api/v1/credits';
const KEY_URL = 'https://openrouter.ai/api/v1/key';
const ACTIVITY_URL = 'https://openrouter.ai/api/v1/activity';

const CACHE_MS = 60_000;

/** @type {Map<string, { fetchedAt: number, payload: object }>} */
const cacheByEmail = new Map();

function openRouterHeaders(apiKey) {
    return {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://amplifood.vercel.app',
        'X-Title': 'AmpliFood',
    };
}

function friendlyUpstream(status, text) {
    try {
        const json = JSON.parse(text);
        const msg = json?.error?.message || json?.message;
        if (msg) return String(msg).slice(0, 200);
    } catch {
        // not JSON
    }
    if (status === 401) return 'OpenRouter rejected the API key.';
    if (status === 403) return 'This key cannot read that stat (management key may be required).';
    if (status === 429) return 'OpenRouter rate limit — try again shortly.';
    return status ? `OpenRouter returned HTTP ${status}.` : 'Could not reach OpenRouter.';
}

async function fetchOpenRouterJson(url, apiKey) {
    let response;
    try {
        response = await fetch(url, { headers: openRouterHeaders(apiKey) });
    } catch (error) {
        return { ok: false, error: `Couldn't reach OpenRouter (${error?.message || 'network'}).` };
    }
    const text = await response.text().catch(() => '');
    if (!response.ok) {
        return { ok: false, error: friendlyUpstream(response.status, text) };
    }
    try {
        return { ok: true, json: JSON.parse(text) };
    } catch {
        return { ok: false, error: 'OpenRouter returned invalid JSON.' };
    }
}

function statValue(value) {
    if (value == null || !Number.isFinite(Number(value))) return { error: "Couldn't read this stat." };
    return { value: Number(value) };
}

function startOfUtcWeekIso() {
    const now = new Date();
    const day = now.getUTCDay();
    const daysFromMonday = (day + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday));
    return monday.toISOString().slice(0, 10);
}

async function fetchCreditsBalance(apiKey) {
    const result = await fetchOpenRouterJson(CREDITS_URL, apiKey);
    if (!result.ok) return { error: result.error };
    const data = result.json?.data ?? result.json;
    const total = Number(data?.total_credits);
    const used = Number(data?.total_usage);
    if (!Number.isFinite(total) || !Number.isFinite(used)) {
        return { error: "Couldn't read credit balance." };
    }
    return { value: total - used };
}

async function fetchKeyUsage(apiKey) {
    const result = await fetchOpenRouterJson(KEY_URL, apiKey);
    if (!result.ok) return { error: result.error };
    const data = result.json?.data ?? result.json;
    if (!data || typeof data !== 'object') {
        return { error: "Couldn't read key usage." };
    }
    return {
        spendToday: statValue(data.usage_daily),
        spendThisWeek: statValue(data.usage_weekly),
        spendThisMonth: statValue(data.usage_monthly),
        limit: data.limit != null ? statValue(data.limit) : { value: null },
        limitRemaining: data.limit_remaining != null ? statValue(data.limit_remaining) : { value: null },
        apiKeyHash: typeof data.hash === 'string' ? data.hash : null,
    };
}

async function fetchCallsThisWeek(provisioningKey, apiKeyHash) {
    const params = new URLSearchParams();
    if (apiKeyHash) params.set('api_key_hash', apiKeyHash);
    const url = params.toString() ? `${ACTIVITY_URL}?${params}` : ACTIVITY_URL;
    const result = await fetchOpenRouterJson(url, provisioningKey);
    if (!result.ok) {
        return { error: result.error };
    }
    const rows = Array.isArray(result.json?.data) ? result.json.data : [];
    const weekStart = startOfUtcWeekIso();
    let count = 0;
    for (const row of rows) {
        const date = String(row?.date || '');
        if (date && date >= weekStart) {
            count += Number(row?.requests) || 0;
        }
    }
    return { value: count };
}

export function getOpenRouterProvisioningKey() {
    const raw = process.env.OPENROUTER_PROVISIONING_KEY;
    return raw && String(raw).trim() ? String(raw).trim() : null;
}

export function resetOpenRouterStatsCache() {
    cacheByEmail.clear();
}

/**
 * @param {{ email: string, apiKey: string, refresh?: boolean }} options
 */
export async function fetchOpenRouterStats({ email, apiKey, refresh = false }) {
    const key = String(email || '').toLowerCase();
    const cached = cacheByEmail.get(key);
    const now = Date.now();
    if (!refresh && cached && now - cached.fetchedAt < CACHE_MS) {
        return { ...cached.payload, cachedAt: cached.fetchedAt, fromCache: true };
    }

    const provisioningKey = getOpenRouterProvisioningKey();

    const [credits, keyUsage] = await Promise.all([fetchCreditsBalance(apiKey), fetchKeyUsage(apiKey)]);

    let callsThisWeek = null;
    let activityNote = null;
    if (provisioningKey) {
        const hash = keyUsage.apiKeyHash || null;
        const calls = await fetchCallsThisWeek(provisioningKey, hash);
        if (calls.error) {
            callsThisWeek = { error: calls.error };
        } else {
            callsThisWeek = { value: calls.value };
        }
    } else {
        activityNote =
            'Calls this week are hidden until OPENROUTER_PROVISIONING_KEY is set on the server (OpenRouter management key with activity access).';
    }

    const payload = {
        cachedAt: now,
        fromCache: false,
        credits: credits.error ? { error: credits.error } : { value: credits.value },
        spendToday: keyUsage.error ? { error: keyUsage.error } : keyUsage.spendToday,
        spendThisWeek: keyUsage.error ? { error: keyUsage.error } : keyUsage.spendThisWeek,
        spendThisMonth: keyUsage.error ? { error: keyUsage.error } : keyUsage.spendThisMonth,
        limit: keyUsage.error ? null : keyUsage.limit,
        limitRemaining: keyUsage.error ? null : keyUsage.limitRemaining,
        callsThisWeek,
        activityNote,
    };

    cacheByEmail.set(key, { fetchedAt: now, payload });
    return payload;
}
