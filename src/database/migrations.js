// Versioned SQLite migrations for Galaxy Health.
//
// Installs that shipped before this runner existed sit at `user_version = 0`
// with the baseline Food Dude tables already present, so every migration has to
// be safe to replay against a populated database.
//
// This module must never import from ./operations — the runner receives the open
// handle as an argument so operations.js can import it without a cycle.

import { createTablesSQL } from './schema';
import { PLANET_IDS, PLANETS } from '../galaxy/planets';

export const CURRENT_SCHEMA_VERSION = 7;

// The cockpit itself: tables that belong to no single world.
const SHELL_OWNER = 'shell';

const columnExists = async (db, table, column) => {
    try {
        const info = await db.getAllAsync(`PRAGMA table_info(${table})`);
        return info.some((col) => col.name === column);
    } catch (error) {
        console.warn(`Could not inspect ${table}.${column}:`, error?.message || error);
        return false;
    }
};

const addColumnIfMissing = async (db, table, column, type, defaultValue) => {
    if (await columnExists(db, table, column)) {
        return false;
    }

    const hasDefault = defaultValue !== undefined && defaultValue !== null;
    const defaultClause = hasDefault ? ` DEFAULT ${defaultValue}` : '';
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${defaultClause};`);

    if (hasDefault) {
        try {
            await db.execAsync(`UPDATE ${table} SET ${column} = ${defaultValue} WHERE ${column} IS NULL;`);
        } catch (error) {
            // Backfill is best effort — an empty table has nothing to update.
            console.log(`Note: could not backfill ${table}.${column} (fine if the table is empty)`);
        }
    }

    console.log(`Added column ${table}.${column}`);
    return true;
};

// Legacy patches that the pre-migration `migrateDatabase` applied on every boot.
// Kept verbatim so nothing regresses for users upgrading from Food Dude.
const LEGACY_USER_COLUMNS = [
    { name: 'username', type: 'TEXT' },
    { name: 'recipes_cooked', type: 'INTEGER', defaultValue: '0' },
    { name: 'flavor_preferences', type: 'TEXT' },
];

const LEGACY_RECIPE_COLUMNS = [
    { name: 'is_cooked', type: 'INTEGER', defaultValue: '0' },
    { name: 'date_added', type: 'TEXT' },
    { name: 'calories', type: 'REAL' },
    { name: 'protein', type: 'REAL' },
    { name: 'carbohydrates', type: 'REAL' },
    { name: 'fat', type: 'REAL' },
    { name: 'fiber', type: 'REAL' },
    { name: 'sugar', type: 'REAL' },
    { name: 'sodium', type: 'REAL' },
];

const GALAXY_CORE_SQL = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS planets (
    id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    renamed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_planet TEXT NOT NULL,
    target_planet TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload_ref TEXT,
    payload_json TEXT,
    seen INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_signals_seen ON signals(seen);
  CREATE INDEX IF NOT EXISTS idx_signals_pair ON signals(source_planet, target_planet);
`;

const ATLAS_SQL = `
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    focus TEXT,
    performed_at INTEGER NOT NULL,
    duration_minutes INTEGER,
    perceived_effort INTEGER,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workout_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL,
    exercise TEXT NOT NULL,
    reps INTEGER,
    weight REAL,
    unit TEXT DEFAULT 'lb',
    order_index INTEGER DEFAULT 0,
    FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_workouts_performed_at ON workouts(performed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workout_sets_workout ON workout_sets(workout_id);
`;

const LUMEN_SQL = `
  CREATE TABLE IF NOT EXISTS mood_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mood INTEGER NOT NULL,
    energy INTEGER,
    note TEXT,
    logged_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sleep_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hours REAL NOT NULL,
    quality INTEGER,
    note TEXT,
    logged_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS focus_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minutes INTEGER NOT NULL,
    label TEXT,
    interrupted INTEGER DEFAULT 0,
    logged_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT NOT NULL,
    mood INTEGER,
    logged_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mood_logs_logged_at ON mood_logs(logged_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sleep_logs_logged_at ON sleep_logs(logged_at DESC);
  CREATE INDEX IF NOT EXISTS idx_focus_sessions_logged_at ON focus_sessions(logged_at DESC);
  CREATE INDEX IF NOT EXISTS idx_journal_entries_logged_at ON journal_entries(logged_at DESC);
`;

const OBSERVATORY_SQL = `
  CREATE TABLE IF NOT EXISTS lab_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    collected_at INTEGER NOT NULL,
    source TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lab_markers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    value REAL,
    unit TEXT,
    ref_low REAL,
    ref_high REAL,
    flag TEXT,
    FOREIGN KEY (panel_id) REFERENCES lab_panels(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_lab_panels_collected ON lab_panels(collected_at DESC);
  CREATE INDEX IF NOT EXISTS idx_lab_markers_panel ON lab_markers(panel_id);
`;

const DOMAIN_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS domain_tables (
    table_name TEXT PRIMARY KEY NOT NULL,
    planet_id TEXT NOT NULL,
    kind TEXT,
    created_at INTEGER NOT NULL
  );
`;

// The cooking tables keep their original names — a lot of working code reads
// them — so ownership is recorded here instead of in the table names.
const TABLE_OWNERSHIP = [
    ['recipes', PLANET_IDS.GALLEY, 'core'],
    ['recipe_ingredients', PLANET_IDS.GALLEY, 'child'],
    ['recipe_instructions', PLANET_IDS.GALLEY, 'child'],
    ['recipe_tags', PLANET_IDS.GALLEY, 'child'],
    ['meal_plans', PLANET_IDS.GALLEY, 'core'],
    ['pantry_items', PLANET_IDS.GALLEY, 'core'],
    ['grocery_items', PLANET_IDS.GALLEY, 'core'],
    ['parties', PLANET_IDS.GALLEY, 'core'],
    ['party_members', PLANET_IDS.GALLEY, 'child'],
    ['party_meals', PLANET_IDS.GALLEY, 'child'],
    ['party_meal_ingredient_claims', PLANET_IDS.GALLEY, 'child'],
    ['recipe_cooking_history', PLANET_IDS.GALLEY, 'child'],

    ['workouts', PLANET_IDS.ATLAS, 'core'],
    ['workout_sets', PLANET_IDS.ATLAS, 'child'],

    ['mood_logs', PLANET_IDS.LUMEN, 'core'],
    ['sleep_logs', PLANET_IDS.LUMEN, 'core'],
    ['focus_sessions', PLANET_IDS.LUMEN, 'core'],
    ['journal_entries', PLANET_IDS.LUMEN, 'core'],

    ['lab_panels', PLANET_IDS.OBSERVATORY, 'core'],
    ['lab_markers', PLANET_IDS.OBSERVATORY, 'child'],

    ['users', SHELL_OWNER, 'system'],
    ['app_settings', SHELL_OWNER, 'system'],
    ['planets', SHELL_OWNER, 'system'],
    ['signals', SHELL_OWNER, 'system'],
    ['domain_tables', SHELL_OWNER, 'system'],
];

export const MIGRATIONS = [
    {
        version: 1,
        name: 'baseline',
        up: async (db) => {
            await db.execAsync(createTablesSQL);

            for (const col of LEGACY_USER_COLUMNS) {
                await addColumnIfMissing(db, 'users', col.name, col.type, col.defaultValue);
            }

            for (const col of LEGACY_RECIPE_COLUMNS) {
                await addColumnIfMissing(db, 'recipes', col.name, col.type, col.defaultValue);
            }
        },
    },
    {
        version: 2,
        name: 'galaxy_core',
        up: async (db) => {
            await db.execAsync(GALAXY_CORE_SQL);

            const now = Date.now();
            for (let index = 0; index < PLANETS.length; index += 1) {
                const planet = PLANETS[index];
                await db.runAsync(
                    `INSERT OR IGNORE INTO planets (id, display_name, enabled, sort_order, renamed_at, created_at, updated_at)
                     VALUES (?, ?, 1, ?, NULL, ?, ?)`,
                    [planet.id, planet.defaultName, index, now, now]
                );
            }
        },
    },
    {
        version: 3,
        name: 'atlas_fitness',
        up: async (db) => {
            await db.execAsync(ATLAS_SQL);
        },
    },
    {
        version: 4,
        name: 'lumen_cognitive',
        up: async (db) => {
            await db.execAsync(LUMEN_SQL);
        },
    },
    {
        version: 5,
        name: 'observatory_labs',
        up: async (db) => {
            await db.execAsync(OBSERVATORY_SQL);
        },
    },
    {
        version: 6,
        name: 'galley_namespace',
        up: async (db) => {
            await db.execAsync(DOMAIN_TABLES_SQL);

            const now = Date.now();
            for (const [tableName, planetId, kind] of TABLE_OWNERSHIP) {
                await db.runAsync(
                    `INSERT OR REPLACE INTO domain_tables (table_name, planet_id, kind, created_at)
                     VALUES (?, ?, ?, ?)`,
                    [tableName, planetId, kind, now]
                );
            }

            // Every world gets its own assistant thread later; existing history
            // all belongs to the cooking planet.
            await addColumnIfMissing(db, 'ai_conversations', 'planet_id', 'TEXT', `'${PLANET_IDS.GALLEY}'`);
            await db.runAsync('UPDATE ai_conversations SET planet_id = ? WHERE planet_id IS NULL', [
                PLANET_IDS.GALLEY,
            ]);
        },
    },
    {
        version: 7,
        name: 'users_flavor_preferences',
        up: async (db) => {
            // Existing Expo Go DBs created the users table before this column
            // existed. CREATE TABLE IF NOT EXISTS will not add it.
            await addColumnIfMissing(db, 'users', 'flavor_preferences', 'TEXT');
        },
    },
];

// Cheap PRAGMA check on every boot so Expo Go installs that already sit at
// user_version >= 6 still get the column even if a versioned step was skipped.
export const ensureRequiredColumns = async (db) => {
    if (!db) {
        throw new Error('ensureRequiredColumns requires an open database handle');
    }
    for (const col of LEGACY_USER_COLUMNS) {
        await addColumnIfMissing(db, 'users', col.name, col.type, col.defaultValue);
    }
};

export const getSchemaVersion = async (db) => {
    try {
        const row = await db.getFirstAsync('PRAGMA user_version');
        const version = Number(row?.user_version ?? 0);
        return Number.isFinite(version) ? version : 0;
    } catch (error) {
        console.warn('Could not read schema version, assuming 0:', error?.message || error);
        return 0;
    }
};

const setSchemaVersion = async (db, version) => {
    const safeVersion = Number.parseInt(version, 10);
    if (!Number.isInteger(safeVersion) || safeVersion < 0) {
        throw new Error(`Refusing to write an invalid schema version: ${version}`);
    }
    // PRAGMA statements reject bound parameters, so the value is validated as an
    // integer above and then interpolated.
    await db.execAsync(`PRAGMA user_version = ${safeVersion};`);
};

export const runMigrations = async (db) => {
    if (!db) {
        throw new Error('runMigrations requires an open database handle');
    }

    const startVersion = await getSchemaVersion(db);
    const pending = MIGRATIONS.filter((migration) => migration.version > startVersion).sort(
        (a, b) => a.version - b.version
    );

    if (pending.length === 0) {
        return startVersion;
    }

    let version = startVersion;
    for (const migration of pending) {
        try {
            await db.withTransactionAsync(async () => {
                await migration.up(db);
            });
            await setSchemaVersion(db, migration.version);
        } catch (error) {
            throw new Error(
                `Migration v${migration.version} (${migration.name}) failed: ${error?.message || error}`
            );
        }
        version = migration.version;
        console.log(`Applied migration v${migration.version} (${migration.name})`);
    }

    return version;
};

export default MIGRATIONS;
