// Shell-level storage: the planet registry mirror, key/value settings, and the
// inter-planet signal log the cockpit draws craft from.

import { getDatabase } from './operations';
import { PLANET_IDS, PLANETS, PLANET_BY_ID, getDefaultName } from '../galaxy/planets';

const MAX_PLANET_NAME_LENGTH = 24;

// The shell renders before we can be certain a migration has landed. Reads
// degrade to an empty value rather than throwing, so a missing table can never
// white-screen the app.
const guard = async (label, fallback, run) => {
    try {
        return await run(getDatabase());
    } catch (error) {
        console.warn(`[galaxy] ${label} unavailable:`, error?.message || error);
        return fallback;
    }
};

const serialiseSettingValue = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
};

const registryFallbackRow = (planet, index) => ({
    id: planet.id,
    display_name: planet.defaultName,
    enabled: 1,
    sort_order: index,
    renamed_at: null,
    created_at: null,
    updated_at: null,
});

export const planetOperations = {
    async ensureSeeded() {
        return guard('planets.ensureSeeded', false, async (db) => {
            const now = Date.now();
            for (let index = 0; index < PLANETS.length; index += 1) {
                const planet = PLANETS[index];
                await db.runAsync(
                    `INSERT OR IGNORE INTO planets (id, display_name, enabled, sort_order, renamed_at, created_at, updated_at)
                     VALUES (?, ?, 1, ?, NULL, ?, ?)`,
                    [planet.id, planet.defaultName, index, now, now]
                );
            }
            return true;
        });
    },

    async getAll() {
        const rows = await guard('planets.getAll', [], (db) =>
            db.getAllAsync('SELECT * FROM planets ORDER BY sort_order ASC, id ASC')
        );

        const byId = {};
        (rows || []).forEach((row) => {
            if (row && PLANET_BY_ID[row.id]) {
                byId[row.id] = row;
            }
        });

        // Always hand back the full registry: seeding may not have run yet, and
        // the cockpit needs every world to place an orbit.
        return PLANETS.map((planet, index) => {
            const row = byId[planet.id];
            if (!row) {
                return registryFallbackRow(planet, index);
            }
            return {
                ...row,
                display_name: row.display_name || planet.defaultName,
                enabled: row.enabled ? 1 : 0,
                sort_order: Number.isFinite(row.sort_order) ? row.sort_order : index,
            };
        }).sort((a, b) => a.sort_order - b.sort_order);
    },

    async getNameMap() {
        const rows = await this.getAll();
        return rows.reduce((acc, row) => {
            acc[row.id] = row.display_name;
            return acc;
        }, {});
    },

    async rename(id, name) {
        if (!PLANET_BY_ID[id]) {
            throw new Error('That world is not part of this system.');
        }

        const trimmed = String(name ?? '').trim();
        if (!trimmed) {
            throw new Error('Give this world a name before saving.');
        }
        if (trimmed.length > MAX_PLANET_NAME_LENGTH) {
            throw new Error(`Names need to be ${MAX_PLANET_NAME_LENGTH} characters or fewer.`);
        }

        return guard('planets.rename', null, async (db) => {
            const now = Date.now();
            const index = PLANETS.findIndex((planet) => planet.id === id);
            await db.runAsync(
                `INSERT OR IGNORE INTO planets (id, display_name, enabled, sort_order, renamed_at, created_at, updated_at)
                 VALUES (?, ?, 1, ?, NULL, ?, ?)`,
                [id, getDefaultName(id), index < 0 ? 0 : index, now, now]
            );
            await db.runAsync(
                'UPDATE planets SET display_name = ?, renamed_at = ?, updated_at = ? WHERE id = ?',
                [trimmed, now, now, id]
            );
            return db.getFirstAsync('SELECT * FROM planets WHERE id = ?', [id]);
        });
    },

    async resetName(id) {
        if (!PLANET_BY_ID[id]) {
            throw new Error('That world is not part of this system.');
        }

        return guard('planets.resetName', null, async (db) => {
            const now = Date.now();
            await db.runAsync(
                'UPDATE planets SET display_name = ?, renamed_at = NULL, updated_at = ? WHERE id = ?',
                [getDefaultName(id), now, id]
            );
            return db.getFirstAsync('SELECT * FROM planets WHERE id = ?', [id]);
        });
    },

    async setEnabled(id, enabled) {
        if (!PLANET_BY_ID[id]) {
            throw new Error('That world is not part of this system.');
        }
        if (id === PLANET_IDS.GALLEY && !enabled) {
            throw new Error('Galley anchors the system — it cannot be switched off.');
        }

        return guard('planets.setEnabled', null, async (db) => {
            const now = Date.now();
            await db.runAsync('UPDATE planets SET enabled = ?, updated_at = ? WHERE id = ?', [
                enabled ? 1 : 0,
                now,
                id,
            ]);
            return db.getFirstAsync('SELECT * FROM planets WHERE id = ?', [id]);
        });
    },
};

export const settingsOperations = {
    async get(key, fallback = null) {
        return guard('settings.get', fallback, async (db) => {
            const row = await db.getFirstAsync('SELECT value FROM app_settings WHERE key = ?', [key]);
            if (!row || row.value === null || row.value === undefined) {
                return fallback;
            }
            return row.value;
        });
    },

    async getJSON(key, fallback = null) {
        const raw = await this.get(key, null);
        if (raw === null || raw === undefined) {
            return fallback;
        }
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.warn(`[galaxy] setting "${key}" is not valid JSON, using fallback`);
            return fallback;
        }
    },

    async set(key, value) {
        return guard('settings.set', false, async (db) => {
            await db.runAsync(
                `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
                [key, serialiseSettingValue(value), Date.now()]
            );
            return true;
        });
    },

    async setJSON(key, value) {
        return this.set(key, JSON.stringify(value ?? null));
    },

    async getAll() {
        return guard('settings.getAll', {}, async (db) => {
            const rows = await db.getAllAsync('SELECT key, value FROM app_settings');
            return (rows || []).reduce((acc, row) => {
                acc[row.key] = row.value;
                return acc;
            }, {});
        });
    },

    async remove(key) {
        return guard('settings.remove', false, async (db) => {
            await db.runAsync('DELETE FROM app_settings WHERE key = ?', [key]);
            return true;
        });
    },
};

export const signalOperations = {
    async create({ sourcePlanet, targetPlanet, kind, payloadRef = null, payload = null }) {
        return guard('signals.create', null, async (db) => {
            const now = Date.now();
            const payloadJson = payload === null || payload === undefined ? null : JSON.stringify(payload);
            const result = await db.runAsync(
                `INSERT INTO signals (source_planet, target_planet, kind, payload_ref, payload_json, seen, created_at)
                 VALUES (?, ?, ?, ?, ?, 0, ?)`,
                [sourcePlanet, targetPlanet, kind, payloadRef, payloadJson, now]
            );
            return db.getFirstAsync('SELECT * FROM signals WHERE id = ?', [result.lastInsertRowId]);
        });
    },

    async recent(limit = 30) {
        return guard('signals.recent', [], async (db) => {
            const rows = await db.getAllAsync(
                'SELECT * FROM signals ORDER BY created_at DESC, id DESC LIMIT ?',
                [limit]
            );
            return rows || [];
        });
    },

    async unseen() {
        return guard('signals.unseen', [], async (db) => {
            const rows = await db.getAllAsync(
                'SELECT * FROM signals WHERE seen = 0 ORDER BY created_at DESC, id DESC'
            );
            return rows || [];
        });
    },

    async since(timestamp) {
        return guard('signals.since', [], async (db) => {
            const rows = await db.getAllAsync(
                'SELECT * FROM signals WHERE created_at > ? ORDER BY created_at DESC, id DESC',
                [Number(timestamp) || 0]
            );
            return rows || [];
        });
    },

    async markSeen(ids) {
        const list = (Array.isArray(ids) ? ids : [ids])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id));

        if (list.length === 0) {
            return 0;
        }

        return guard('signals.markSeen', 0, async (db) => {
            const placeholders = list.map(() => '?').join(', ');
            const result = await db.runAsync(
                `UPDATE signals SET seen = 1 WHERE id IN (${placeholders})`,
                list
            );
            return result?.changes || 0;
        });
    },

    async markAllSeen() {
        return guard('signals.markAllSeen', 0, async (db) => {
            const result = await db.runAsync('UPDATE signals SET seen = 1 WHERE seen = 0');
            return result?.changes || 0;
        });
    },

    async countsByPair() {
        return guard('signals.countsByPair', [], async (db) => {
            const rows = await db.getAllAsync(
                `SELECT source_planet, target_planet, COUNT(*) AS count
                 FROM signals
                 GROUP BY source_planet, target_planet
                 ORDER BY count DESC`
            );
            return rows || [];
        });
    },

    async countUnseen() {
        return guard('signals.countUnseen', 0, async (db) => {
            const row = await db.getFirstAsync('SELECT COUNT(*) AS count FROM signals WHERE seen = 0');
            return row?.count || 0;
        });
    },

    async stats() {
        const empty = { total: 0, unseen: 0, last24h: 0, lastAt: null };
        return guard('signals.stats', empty, async (db) => {
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;
            const row = await db.getFirstAsync(
                `SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN seen = 0 THEN 1 ELSE 0 END) AS unseen,
                    SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last24h,
                    MAX(created_at) AS lastAt
                 FROM signals`,
                [cutoff]
            );
            return {
                total: row?.total || 0,
                unseen: row?.unseen || 0,
                last24h: row?.last24h || 0,
                lastAt: row?.lastAt ?? null,
            };
        });
    },

    async clearAll() {
        return guard('signals.clearAll', 0, async (db) => {
            const result = await db.runAsync('DELETE FROM signals');
            return result?.changes || 0;
        });
    },
};
