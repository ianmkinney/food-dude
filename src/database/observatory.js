// Observatory — lab panels and biomarkers.

import { getDatabase } from './operations';

const guard = async (label, fallback, run) => {
    try {
        return await run(getDatabase());
    } catch (error) {
        console.warn(`[observatory] ${label} unavailable:`, error?.message || error);
        return fallback;
    }
};

const numberOrNull = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

// A marker is only flagged when there is both a value and something to compare
// it against; otherwise the flag stays null so the UI can show it as unscored.
const deriveFlag = (value, refLow, refHigh) => {
    const numeric = numberOrNull(value);
    const low = numberOrNull(refLow);
    const high = numberOrNull(refHigh);

    if (numeric === null || (low === null && high === null)) {
        return null;
    }
    if (low !== null && numeric < low) {
        return 'low';
    }
    if (high !== null && numeric > high) {
        return 'high';
    }
    return 'normal';
};

const insertMarker = async (db, panelId, marker) => {
    const value = numberOrNull(marker?.value);
    const refLow = numberOrNull(marker?.refLow);
    const refHigh = numberOrNull(marker?.refHigh);

    return db.runAsync(
        `INSERT INTO lab_markers (panel_id, name, value, unit, ref_low, ref_high, flag)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            panelId,
            marker?.name ?? 'Marker',
            value,
            marker?.unit ?? null,
            refLow,
            refHigh,
            deriveFlag(value, refLow, refHigh),
        ]
    );
};

const hydratePanel = (panel, markerRows) => {
    const markers = markerRows || [];
    return {
        ...panel,
        markers,
        outOfRange: markers.filter((marker) => marker.flag === 'low' || marker.flag === 'high').length,
    };
};

export const labOperations = {
    async createPanel({ name, collectedAt = Date.now(), source = null, notes = null, markers = [] }) {
        return guard('labs.createPanel', null, async (db) => {
            const now = Date.now();
            let panelId = null;

            await db.withTransactionAsync(async () => {
                const result = await db.runAsync(
                    `INSERT INTO lab_panels (name, collected_at, source, notes, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [name, collectedAt, source, notes, now, now]
                );
                panelId = result.lastInsertRowId;

                for (const marker of markers) {
                    await insertMarker(db, panelId, marker);
                }
            });

            return this.getPanel(panelId);
        });
    },

    async addMarker(panelId, { name, value = null, unit = null, refLow = null, refHigh = null }) {
        return guard('labs.addMarker', null, async (db) => {
            const result = await insertMarker(db, panelId, { name, value, unit, refLow, refHigh });
            await db.runAsync('UPDATE lab_panels SET updated_at = ? WHERE id = ?', [Date.now(), panelId]);
            return db.getFirstAsync('SELECT * FROM lab_markers WHERE id = ?', [result.lastInsertRowId]);
        });
    },

    async listPanels(limit = 25) {
        return guard('labs.listPanels', [], async (db) => {
            const panels = await db.getAllAsync(
                'SELECT * FROM lab_panels ORDER BY collected_at DESC, id DESC LIMIT ?',
                [limit]
            );
            if (!panels || panels.length === 0) {
                return [];
            }

            const placeholders = panels.map(() => '?').join(', ');
            const markerRows = await db.getAllAsync(
                `SELECT * FROM lab_markers WHERE panel_id IN (${placeholders})
                 ORDER BY panel_id ASC, id ASC`,
                panels.map((panel) => panel.id)
            );

            const markersByPanel = {};
            (markerRows || []).forEach((row) => {
                if (!markersByPanel[row.panel_id]) {
                    markersByPanel[row.panel_id] = [];
                }
                markersByPanel[row.panel_id].push(row);
            });

            return panels.map((panel) => hydratePanel(panel, markersByPanel[panel.id] || []));
        });
    },

    async getPanel(id) {
        return guard('labs.getPanel', null, async (db) => {
            const panel = await db.getFirstAsync('SELECT * FROM lab_panels WHERE id = ?', [id]);
            if (!panel) {
                return null;
            }
            const markerRows = await db.getAllAsync(
                'SELECT * FROM lab_markers WHERE panel_id = ? ORDER BY id ASC',
                [id]
            );
            return hydratePanel(panel, markerRows);
        });
    },

    async removePanel(id) {
        return guard('labs.removePanel', false, async (db) => {
            await db.withTransactionAsync(async () => {
                await db.runAsync('DELETE FROM lab_markers WHERE panel_id = ?', [id]);
                await db.runAsync('DELETE FROM lab_panels WHERE id = ?', [id]);
            });
            return true;
        });
    },

    async stats() {
        const empty = { panels: 0, markers: 0, outOfRange: 0, lastPanelAt: null };

        return guard('labs.stats', empty, async (db) => {
            const panelRow = await db.getFirstAsync(
                'SELECT COUNT(*) AS panels, MAX(collected_at) AS lastPanelAt FROM lab_panels'
            );
            const markerRow = await db.getFirstAsync(
                `SELECT
                    COUNT(*) AS markers,
                    SUM(CASE WHEN flag IN ('low', 'high') THEN 1 ELSE 0 END) AS outOfRange
                 FROM lab_markers`
            );

            return {
                panels: panelRow?.panels || 0,
                markers: markerRow?.markers || 0,
                outOfRange: markerRow?.outOfRange || 0,
                lastPanelAt: panelRow?.lastPanelAt ?? null,
            };
        });
    },
};

// Convenience presets so the user does not have to retype common panels.
// These are typical adult reference intervals for quick entry only — individual
// labs publish their own ranges, and nothing here is medical advice.
export const COMMON_MARKERS = [
    { name: 'Vitamin D (25-OH)', unit: 'ng/mL', refLow: 30, refHigh: 100 },
    { name: 'Ferritin', unit: 'ng/mL', refLow: 30, refHigh: 300 },
    { name: 'HbA1c', unit: '%', refLow: 4, refHigh: 5.6 },
    { name: 'hsCRP', unit: 'mg/L', refLow: 0, refHigh: 3 },
    { name: 'LDL cholesterol', unit: 'mg/dL', refLow: 0, refHigh: 100 },
    { name: 'HDL cholesterol', unit: 'mg/dL', refLow: 40, refHigh: 90 },
    { name: 'Triglycerides', unit: 'mg/dL', refLow: 0, refHigh: 150 },
    { name: 'TSH', unit: 'mIU/L', refLow: 0.4, refHigh: 4 },
    { name: 'Total testosterone', unit: 'ng/dL', refLow: 300, refHigh: 1000 },
    { name: 'Fasting glucose', unit: 'mg/dL', refLow: 70, refHigh: 99 },
];
