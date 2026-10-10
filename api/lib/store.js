/** Best-effort in-memory per-minute rate limit (not shared across serverless instances). */
const memory = new Map();

const RL_MAX_PER_MINUTE = 10;

export function checkMinuteRateLimit(userId) {
    const minute = Math.floor(Date.now() / 60_000);
    const memKey = `rl:${userId}:${minute}`;
    const count = (memory.get(memKey) || 0) + 1;
    memory.set(memKey, count);
    return count <= RL_MAX_PER_MINUTE;
}
