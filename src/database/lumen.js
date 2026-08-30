// Lumen — cognitive health storage: mood, sleep, focus and journal.

import { getDatabase } from './operations';

export const MOOD_SCALE = [
    { value: 1, label: 'Rough', glyph: '😞' },
    { value: 2, label: 'Low', glyph: '🙁' },
    { value: 3, label: 'Steady', glyph: '😐' },
    { value: 4, label: 'Good', glyph: '🙂' },
    { value: 5, label: 'Excellent', glyph: '😄' },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const KIND_TABLES = {
    mood: 'mood_logs',
    sleep: 'sleep_logs',
    focus: 'focus_sessions',
    journal: 'journal_entries',
};

const guard = async (label, fallback, run) => {
    try {
        return await run(getDatabase());
    } catch (error) {
        console.warn(`[lumen] ${label} unavailable:`, error?.message || error);
        return fallback;
    }
};

const startOfDay = (timestamp) => {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

// Stepping with setDate rather than subtracting 24h keeps the walk correct
// across daylight-saving boundaries.
const previousDay = (timestamp) => {
    const date = new Date(timestamp);
    date.setDate(date.getDate() - 1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

const streakFromTimestamps = (timestamps) => {
    const days = new Set((timestamps || []).map(startOfDay));
    if (days.size === 0) {
        return 0;
    }

    const today = startOfDay(Date.now());
    // A streak survives a day that is still in progress.
    let cursor = days.has(today) ? today : previousDay(today);
    if (!days.has(cursor)) {
        return 0;
    }

    let streak = 0;
    while (days.has(cursor)) {
        streak += 1;
        cursor = previousDay(cursor);
    }
    return streak;
};

const round1 = (value) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return null;
    }
    return Math.round(Number(value) * 10) / 10;
};

export const lumenOperations = {
    async logMood({ mood, energy = null, note = null, loggedAt = Date.now() }) {
        return guard('lumen.logMood', null, async (db) => {
            const result = await db.runAsync(
                'INSERT INTO mood_logs (mood, energy, note, logged_at, created_at) VALUES (?, ?, ?, ?, ?)',
                [mood, energy, note, loggedAt, Date.now()]
            );
            return db.getFirstAsync('SELECT * FROM mood_logs WHERE id = ?', [result.lastInsertRowId]);
        });
    },

    async logSleep({ hours, quality = null, note = null, loggedAt = Date.now() }) {
        return guard('lumen.logSleep', null, async (db) => {
            const result = await db.runAsync(
                'INSERT INTO sleep_logs (hours, quality, note, logged_at, created_at) VALUES (?, ?, ?, ?, ?)',
                [hours, quality, note, loggedAt, Date.now()]
            );
            return db.getFirstAsync('SELECT * FROM sleep_logs WHERE id = ?', [result.lastInsertRowId]);
        });
    },

    async logFocus({ minutes, label = null, interrupted = 0, loggedAt = Date.now() }) {
        return guard('lumen.logFocus', null, async (db) => {
            const result = await db.runAsync(
                'INSERT INTO focus_sessions (minutes, label, interrupted, logged_at, created_at) VALUES (?, ?, ?, ?, ?)',
                [minutes, label, interrupted ? 1 : 0, loggedAt, Date.now()]
            );
            return db.getFirstAsync('SELECT * FROM focus_sessions WHERE id = ?', [result.lastInsertRowId]);
        });
    },

    async addJournal({ title = null, body, mood = null, loggedAt = Date.now() }) {
        return guard('lumen.addJournal', null, async (db) => {
            const now = Date.now();
            const result = await db.runAsync(
                `INSERT INTO journal_entries (title, body, mood, logged_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [title, body, mood, loggedAt, now, now]
            );
            return db.getFirstAsync('SELECT * FROM journal_entries WHERE id = ?', [result.lastInsertRowId]);
        });
    },

    async listEntries(limit = 40) {
        const kinds = Object.keys(KIND_TABLES);

        const batches = await Promise.all(
            kinds.map((kind) =>
                guard(`lumen.listEntries(${kind})`, [], async (db) => {
                    const rows = await db.getAllAsync(
                        `SELECT * FROM ${KIND_TABLES[kind]} ORDER BY logged_at DESC, id DESC LIMIT ?`,
                        [limit]
                    );
                    // `key` is unique across kinds so the UI can use it directly
                    // as a React key in the merged feed.
                    return (rows || []).map((row) => ({ ...row, key: `${kind}-${row.id}`, kind }));
                })
            )
        );

        return batches
            .flat()
            .sort((a, b) => (b.logged_at || 0) - (a.logged_at || 0) || String(a.key).localeCompare(b.key))
            .slice(0, limit);
    },

    async remove(kind, id) {
        const table = KIND_TABLES[kind];
        if (!table) {
            throw new Error(`Unknown Lumen entry kind: ${kind}`);
        }

        return guard('lumen.remove', false, async (db) => {
            await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
            return true;
        });
    },

    async stats() {
        const empty = {
            avgMood7d: null,
            avgEnergy7d: null,
            avgSleep7d: null,
            focusMinutes7d: 0,
            journalCount: 0,
            entryCount: 0,
            lastLogAt: null,
            streakDays: 0,
        };

        const cutoff = Date.now() - WEEK_MS;

        const mood = await guard('lumen.stats(mood)', null, (db) =>
            db.getFirstAsync(
                `SELECT AVG(mood) AS avgMood, AVG(energy) AS avgEnergy, COUNT(*) AS total, MAX(logged_at) AS lastAt
                 FROM mood_logs WHERE logged_at >= ?`,
                [cutoff]
            )
        );
        const sleep = await guard('lumen.stats(sleep)', null, (db) =>
            db.getFirstAsync(
                'SELECT AVG(hours) AS avgHours, COUNT(*) AS total FROM sleep_logs WHERE logged_at >= ?',
                [cutoff]
            )
        );
        const focus = await guard('lumen.stats(focus)', null, (db) =>
            db.getFirstAsync(
                'SELECT SUM(minutes) AS minutes FROM focus_sessions WHERE logged_at >= ?',
                [cutoff]
            )
        );

        // Queried per table rather than as one UNION so a single table that a
        // migration has not created yet cannot blank out the whole summary.
        const timestampBatches = await Promise.all(
            Object.values(KIND_TABLES).map((table) =>
                guard(`lumen.stats(${table})`, [], async (db) => {
                    const rows = await db.getAllAsync(`SELECT logged_at FROM ${table}`);
                    return (rows || []).map((row) => row.logged_at).filter((value) => Number.isFinite(value));
                })
            )
        );
        const timestamps = timestampBatches.flat();

        const journalCount = await guard('lumen.stats(journal)', 0, async (db) => {
            const row = await db.getFirstAsync('SELECT COUNT(*) AS count FROM journal_entries');
            return row?.count || 0;
        });

        if (timestamps.length === 0 && journalCount === 0) {
            return empty;
        }

        return {
            avgMood7d: mood?.total ? round1(mood.avgMood) : null,
            avgEnergy7d: mood?.avgEnergy === null || mood?.avgEnergy === undefined ? null : round1(mood.avgEnergy),
            avgSleep7d: sleep?.total ? round1(sleep.avgHours) : null,
            focusMinutes7d: Math.round(focus?.minutes || 0),
            journalCount,
            entryCount: timestamps.length,
            lastLogAt: timestamps.length
                ? timestamps.reduce((latest, value) => (value > latest ? value : latest), timestamps[0])
                : null,
            streakDays: streakFromTimestamps(timestamps),
        };
    },
};
