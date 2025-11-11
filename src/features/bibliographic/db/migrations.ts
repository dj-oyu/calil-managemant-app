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
