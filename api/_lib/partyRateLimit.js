const WINDOW_MS = 60_000;

/**
 * Durable per-minute rate limit (Postgres). Fail closed on any DB error.
 * @param {import('@neondatabase/serverless').NeonQueryFunction} sql
 * @param {string} rateKey
 * @param {number} maxPerMinute
 */
export async function consumePartyRateLimit(sql, rateKey, maxPerMinute) {
    try {
        const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
        const rows = await sql`
            INSERT INTO rate_limits (rate_key, window_start, count)
            VALUES (${rateKey}, ${windowStart.toISOString()}, 1)
            ON CONFLICT (rate_key, window_start)
            DO UPDATE SET count = rate_limits.count + 1
            RETURNING count`;
        const count = Number(rows[0]?.count ?? 0);
        return count <= maxPerMinute;
    } catch (error) {
        console.error('[party/rate-limit]', error?.message || error);
        return false;
    }
}
