import type { Database } from "bun:sqlite";
import { logger } from "../../../shared/logging/logger";

/**
 * Migration definition
 */
export type Migration = {
    version: number;
    name: string;
    up: (db: Database) => void;
};

/**
 * All database migrations in order
 */
export const migrations: Migration[] = [
    {
        version: 1,
        name: "add_description_column",
        up: (db: Database) => {
            // Add description column to bibliographic_info table
            try {
                db.run(`ALTER TABLE bibliographic_info ADD COLUMN description TEXT`);
                logger.info("Migration: Added description column to bibliographic_info");
            } catch (error) {
                // Column might already exist, check error
                const errorMsg = String(error);
                if (!errorMsg.includes("duplicate column")) {
                    throw error;
                }
                logger.debug("Migration: description column already exists");
            }
        },
    },
    {
        version: 2,
        name: "add_ndl_metadata_columns",
        up: (db: Database) => {
            // Add all NDL metadata columns to bibliographic_info table
            const newColumns = [
                "link TEXT",
                "issued TEXT",
                "extent TEXT",
                "price TEXT",
                "ndl_bib_id TEXT",
                "jpno TEXT",
                "tohan_marc_no TEXT",
                "subjects TEXT",
                "categories TEXT",
            ];

            for (const column of newColumns) {
                try {
                    const columnName = column.split(" ")[0];
                    db.run(`ALTER TABLE bibliographic_info ADD COLUMN ${column}`);
                    logger.info(`Migration: Added ${columnName} column to bibliographic_info`);
                } catch (error) {
                    // Column might already exist, check error
                    const errorMsg = String(error);
                    if (!errorMsg.includes("duplicate column")) {
                        throw error;
                    }
                    logger.debug(`Migration: ${column.split(" ")[0]} column already exists`);
                }
            }
        },
    },
    {
        version: 3,
        name: "rename_columns_to_ndl_naming",
        up: (db: Database) => {
            // Rename columns to match NDL API naming for consistency
            // SQLite supports ALTER TABLE RENAME COLUMN since 3.25.0
            const columnRenames = [
                { from: "authors", to: "creators" },
                { from: "authors_kana", to: "creators_kana" },
            ];

            for (const rename of columnRenames) {
                try {
                    db.run(`ALTER TABLE bibliographic_info RENAME COLUMN ${rename.from} TO ${rename.to}`);
                    logger.info(`Migration: Renamed ${rename.from} to ${rename.to}`);
                } catch (error) {
                    const errorMsg = String(error);
                    // Ignore if column doesn't exist or already renamed
                    if (!errorMsg.includes("no such column") && !errorMsg.includes("duplicate column")) {
                        throw error;
                    }
                    logger.debug(`Migration: Column rename ${rename.from} → ${rename.to} skipped`);
                }
            }
        },
    },
];

/**
 * Initialize migration tracking table
 */
function initMigrationTable(db: Database): void {
    db.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

/**
 * Get list of applied migration versions
 */
function getAppliedMigrations(db: Database): number[] {
    const stmt = db.prepare("SELECT version FROM schema_migrations ORDER BY version");
    const rows = stmt.all() as { version: number }[];
    return rows.map((row) => row.version);
}

/**
 * Mark migration as applied
 */
function markMigrationApplied(db: Database, migration: Migration): void {
    db.prepare(`
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
    `).run(migration.version, migration.name);
}

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database): void {
    // Initialize migration tracking table
    initMigrationTable(db);

    // Get applied migrations
    const appliedVersions = new Set(getAppliedMigrations(db));
    const pendingMigrations = migrations.filter(
        (m) => !appliedVersions.has(m.version)
    );

    if (pendingMigrations.length === 0) {
        logger.debug("No pending migrations");
        return;
    }

    logger.info(`Running ${pendingMigrations.length} pending migration(s)`);

    // Run each pending migration in a transaction
    for (const migration of pendingMigrations) {
        db.run("BEGIN TRANSACTION");
        try {
            logger.info(`Applying migration ${migration.version}: ${migration.name}`);
            migration.up(db);
            markMigrationApplied(db, migration);
            db.run("COMMIT");
            logger.info(`✓ Migration ${migration.version} applied successfully`);
        } catch (error) {
            db.run("ROLLBACK");
            logger.error(`✗ Migration ${migration.version} failed`, {
                migration: migration.name,
                error: String(error),
            });
            throw new Error(
                `Migration ${migration.version} (${migration.name}) failed: ${error}`
            );
        }
    }

    logger.info("All migrations completed successfully");
}

/**
 * Get current schema version
 */
export function getCurrentVersion(db: Database): number {
    initMigrationTable(db);
    const versions = getAppliedMigrations(db);
    return versions.length > 0 ? Math.max(...versions) : 0;
}

/**
 * Check if migrations are needed
 */
export function hasPendingMigrations(db: Database): boolean {
    initMigrationTable(db);
    const appliedVersions = new Set(getAppliedMigrations(db));
    return migrations.some((m) => !appliedVersions.has(m.version));
}
