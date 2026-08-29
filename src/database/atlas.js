// Atlas — fitness and strength storage.

import { getDatabase } from './operations';

export const ATLAS_FOCUS = ['Push', 'Pull', 'Legs', 'Full body', 'Conditioning', 'Mobility'];

const KG_TO_LB = 2.20462;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const guard = async (label, fallback, run) => {
    try {
        return await run(getDatabase());
    } catch (error) {
        console.warn(`[atlas] ${label} unavailable:`, error?.message || error);
        return fallback;
    }
};

// Logs can mix units, so every volume figure is expressed in pounds to keep
// weekly and all-time totals comparable.
const toPounds = (weight, unit) => {
    const value = Number(weight) || 0;
    return String(unit || 'lb').toLowerCase() === 'kg' ? value * KG_TO_LB : value;
};

const setVolume = (row) => (Number(row?.reps) || 0) * toPounds(row?.weight, row?.unit);

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
    // A streak survives a day that is still in progress, so start from yesterday
    // when nothing has been logged yet today.
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

const hydrateSets = (rows) =>
    (rows || []).map((row) => ({ ...row, volume: setVolume(row) }));

const hydrateWorkout = (workout, setRows) => {
    const sets = hydrateSets(setRows);
    return {
        ...workout,
        sets,
        volume: sets.reduce((total, set) => total + set.volume, 0),
    };
};

const insertSet = async (db, workoutId, set, orderIndex) =>
    db.runAsync(
        `INSERT INTO workout_sets (workout_id, exercise, reps, weight, unit, order_index)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            workoutId,
            set?.exercise ?? 'Exercise',
            set?.reps ?? null,
            set?.weight ?? null,
            set?.unit || 'lb',
            orderIndex,
        ]
    );

export const workoutOperations = {
    async create({
        name,
        focus = null,
        performedAt = Date.now(),
        durationMinutes = null,
        perceivedEffort = null,
        notes = null,
        sets = [],
    }) {
        return guard('workouts.create', null, async (db) => {
            const now = Date.now();
            let workoutId = null;

            await db.withTransactionAsync(async () => {
                const result = await db.runAsync(
                    `INSERT INTO workouts (name, focus, performed_at, duration_minutes, perceived_effort, notes, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [name, focus, performedAt, durationMinutes, perceivedEffort, notes, now, now]
                );
                workoutId = result.lastInsertRowId;

                for (let index = 0; index < sets.length; index += 1) {
                    await insertSet(db, workoutId, sets[index], index);
                }
            });

            return this.getById(workoutId);
        });
    },

    async addSet(workoutId, { exercise, reps = null, weight = null, unit = 'lb' }) {
        return guard('workouts.addSet', null, async (db) => {
            const row = await db.getFirstAsync(
                'SELECT COALESCE(MAX(order_index), -1) AS max_order FROM workout_sets WHERE workout_id = ?',
                [workoutId]
            );
            const orderIndex = (row?.max_order ?? -1) + 1;
            const result = await insertSet(db, workoutId, { exercise, reps, weight, unit }, orderIndex);
            await db.runAsync('UPDATE workouts SET updated_at = ? WHERE id = ?', [Date.now(), workoutId]);

            const inserted = await db.getFirstAsync('SELECT * FROM workout_sets WHERE id = ?', [
                result.lastInsertRowId,
            ]);
            return inserted ? { ...inserted, volume: setVolume(inserted) } : null;
        });
    },

    async listRecent(limit = 25) {
        return guard('workouts.listRecent', [], async (db) => {
            const workouts = await db.getAllAsync(
                'SELECT * FROM workouts ORDER BY performed_at DESC, id DESC LIMIT ?',
                [limit]
            );
            if (!workouts || workouts.length === 0) {
                return [];
            }

            const placeholders = workouts.map(() => '?').join(', ');
            const setRows = await db.getAllAsync(
                `SELECT * FROM workout_sets WHERE workout_id IN (${placeholders})
                 ORDER BY workout_id ASC, order_index ASC, id ASC`,
                workouts.map((workout) => workout.id)
            );

            const setsByWorkout = {};
            (setRows || []).forEach((row) => {
                if (!setsByWorkout[row.workout_id]) {
                    setsByWorkout[row.workout_id] = [];
                }
                setsByWorkout[row.workout_id].push(row);
            });

            return workouts.map((workout) => hydrateWorkout(workout, setsByWorkout[workout.id] || []));
        });
    },

    async getById(id) {
        return guard('workouts.getById', null, async (db) => {
            const workout = await db.getFirstAsync('SELECT * FROM workouts WHERE id = ?', [id]);
            if (!workout) {
                return null;
            }
            const setRows = await db.getAllAsync(
                'SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY order_index ASC, id ASC',
                [id]
            );
            return hydrateWorkout(workout, setRows);
        });
    },

    async remove(id) {
        return guard('workouts.remove', false, async (db) => {
            await db.withTransactionAsync(async () => {
                await db.runAsync('DELETE FROM workout_sets WHERE workout_id = ?', [id]);
                await db.runAsync('DELETE FROM workouts WHERE id = ?', [id]);
            });
            return true;
        });
    },

    async stats() {
        const empty = {
            totalSessions: 0,
            sessions7d: 0,
            volume7d: 0,
            volumeAllTime: 0,
            streakDays: 0,
            lastSessionAt: null,
            topExercise: null,
        };

        return guard('workouts.stats', empty, async (db) => {
            const cutoff = Date.now() - WEEK_MS;

            const totals = await db.getFirstAsync(
                `SELECT
                    COUNT(*) AS totalSessions,
                    SUM(CASE WHEN performed_at >= ? THEN 1 ELSE 0 END) AS sessions7d,
                    MAX(performed_at) AS lastSessionAt
                 FROM workouts`,
                [cutoff]
            );

            const setRows = await db.getAllAsync(
                `SELECT s.reps, s.weight, s.unit, w.performed_at
                 FROM workout_sets s
                 JOIN workouts w ON w.id = s.workout_id`
            );

            let volume7d = 0;
            let volumeAllTime = 0;
            (setRows || []).forEach((row) => {
                const volume = setVolume(row);
                volumeAllTime += volume;
                if (row.performed_at >= cutoff) {
                    volume7d += volume;
                }
            });

            const dayRows = await db.getAllAsync('SELECT performed_at FROM workouts');
            const topRow = await db.getFirstAsync(
                `SELECT exercise, COUNT(*) AS sets
                 FROM workout_sets
                 GROUP BY exercise
                 ORDER BY sets DESC, exercise ASC
                 LIMIT 1`
            );

            return {
                totalSessions: totals?.totalSessions || 0,
                sessions7d: totals?.sessions7d || 0,
                volume7d: Math.round(volume7d),
                volumeAllTime: Math.round(volumeAllTime),
                streakDays: streakFromTimestamps((dayRows || []).map((row) => row.performed_at)),
                lastSessionAt: totals?.lastSessionAt ?? null,
                topExercise: topRow?.exercise ?? null,
            };
        });
    },
};
