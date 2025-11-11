import { Database } from "bun:sqlite";
import { existsSync, unlinkSync, renameSync, readdirSync } from "node:fs";
import { appRoot } from "../../../shared/config/app-paths";
import path from "node:path";
import { runMigrations, getCurrentVersion, migrations } from "./migrations";
import { logger } from "../../../shared/logging/logger";

export type BibliographicRecord = {
    isbn: string;
    title: string;
    title_kana: string | null;
    link: string | null; // NDL link
    creators: string; // JSON array string (matches NDL API)
    creators_kana: string | null; // JSON array string (matches NDL API)
    publisher: string | null;
    pub_year: string | null;
    issued: string | null; // dcterms:issued
    extent: string | null; // Page count
    price: string | null; // Price
    ndc10: string | null;
    ndlc: string | null;
    ndl_bib_id: string | null; // NDL Bibliographic ID
    jpno: string | null; // JP number
    tohan_marc_no: string | null; // TOHAN MARC number
    subjects: string | null; // JSON array string
    categories: string | null; // JSON array string
    description: string | null; // HTML description from NDL
    created_at: string;
    updated_at: string;
};

export type BibliographicInfo = {
    isbn: string;
    title: string;
    title_kana?: string | null;
    link?: string | null; // NDL link
    creators: string[]; // Matches NDL API naming
    creators_kana?: string[]; // Matches NDL API naming
    publisher: string | null;
    pub_year: string | null;
    issued?: string | null; // dcterms:issued
    extent?: string | null; // Page count
    price?: string | null; // Price
    ndc10: string | null;
    ndlc: string | null;
    ndl_bib_id?: string | null; // NDL Bibliographic ID
    jpno?: string | null; // JP number
    tohan_marc_no?: string | null; // TOHAN MARC number
    subjects?: string[]; // Other subjects
    categories?: string[]; // Categories
    description?: string | null; // HTML description from NDL
};

export type SearchOptions = {
    query?: string; // Free text search across title, creators, publisher
    title?: string;
    author?: string;
    publisher?: string;
    isbn?: string;
    ndc10?: string;
    ndlc?: string;
    yearFrom?: string;
    yearTo?: string;
    limit?: number;
    offset?: number;
};

let dbInstance: Database | null = null;

/**
 * Expected schema version (should match the latest migration version)
 */
const EXPECTED_SCHEMA_VERSION = migrations.length > 0
    ? Math.max(...migrations.map(m => m.version))
    : 0;

/**
 * Check if database schema is outdated and needs reset
 * Returns [shouldReset, currentVersion]
 */
function shouldResetDatabase(dbPath: string): [boolean, number | null] {
    if (!existsSync(dbPath)) {
        return [false, null]; // New database, no reset needed
    }

    let tempDb: Database | null = null;
    try {
        // Open database temporarily to check version
        tempDb = new Database(dbPath, { readonly: true });
        const currentVersion = getCurrentVersion(tempDb);

        // Reset if current version is less than expected
        if (currentVersion < EXPECTED_SCHEMA_VERSION) {
            logger.info("Database schema is outdated, will reset", {
                currentVersion,
                expectedVersion: EXPECTED_SCHEMA_VERSION,
            });
            return [true, currentVersion];
        }

        return [false, currentVersion];
    } catch (error) {
        // If we can't read the database, reset it
        logger.warn("Failed to check database version, will reset", {
            error: String(error),
        });
        return [true, null];
    } finally {
        // Ensure database is closed before attempting rename
        if (tempDb) {
            try {
                tempDb.close();
                // Add delay to ensure Windows releases file handle
                // Windows can take a significant amount of time to release file handles
                // especially for SQLite databases with WAL mode or journal files
                Bun.sleepSync(200);
            } catch (closeError) {
                logger.warn("Error closing temporary database", {
                    error: String(closeError),
                });
            }
        }
    }
}

/**
 * Reset database by renaming the old file and creating a new one
 * This avoids file locking issues on Windows
 * Implements retry logic for Windows file locking
 */
function resetDatabase(dbPath: string): void {
    if (!existsSync(dbPath)) {
        return; // File doesn't exist, nothing to reset
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${dbPath}.${timestamp}.old`;

    // Retry logic for Windows file locking issues
    // Windows can be very slow to release database file handles
    const maxRetries = 10;
    const retryDelays = [200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000]; // Progressive delays in ms

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                logger.debug(`Retry attempt ${attempt + 1}/${maxRetries} for database reset`, {
                    delay: retryDelays[attempt - 1],
                });
                // Use Bun.sleepSync for synchronous sleep
                Bun.sleepSync(retryDelays[attempt - 1]!);
            }

            // Rename instead of delete to avoid locking issues
            renameSync(dbPath, backupPath);
            logger.info("Database file renamed for reset", {
                oldPath: dbPath,
                newPath: backupPath,
                attempts: attempt + 1,
            });

            // Success! Clean up old backups
            try {
                const dir = path.dirname(dbPath);
                const basename = path.basename(dbPath);
                const oldBackups = readdirSync(dir)
                    .filter((f: string) => f.startsWith(basename) && f.endsWith(".old"))
                    .map((f: string) => path.join(dir, f));

                // Keep only the most recent 3 backups
                if (oldBackups.length > 3) {
                    oldBackups
                        .sort()
                        .slice(0, -3)
                        .forEach((f: string) => {
                            try {
                                unlinkSync(f);
                                logger.debug("Deleted old backup", { path: f });
                            } catch {
                                // Ignore errors when deleting old backups
                            }
                        });
                }
            } catch {
                // Ignore errors when cleaning up old backups
            }

            return; // Success!
        } catch (error: any) {
            lastError = error;
            const errorMsg = String(error);

            // If it's a file locking error (EBUSY), retry
            if (errorMsg.includes("EBUSY") || errorMsg.includes("resource busy")) {
                logger.warn(`Database file is locked, will retry`, {
                    attempt: attempt + 1,
                    maxRetries,
                    error: errorMsg,
                });
                continue;
            }

            // For other errors, fail immediately
            logger.error("Failed to reset database file (non-locking error)", {
                path: dbPath,
                error: errorMsg,
            });
            throw new Error(
                `Cannot reset database file: ${error.message}. Path: ${dbPath}`
            );
        }
    }

    // All retries failed
    logger.error("Failed to reset database file after all retries", {
        path: dbPath,
        attempts: maxRetries,
        error: String(lastError),
    });
    throw new Error(
        `Cannot reset database file after ${maxRetries} attempts: ${lastError?.message}. ` +
        `Path: ${dbPath}. Please close all applications using this database.`
    );
}

/**
 * Get or create database instance (singleton)
 * Automatically resets database if schema is outdated
 */
export function getDatabase(): Database {
    if (!dbInstance) {
        const dbPath = path.join(appRoot, "bibliographic.db");

        // Check if database needs reset due to outdated schema
        const [shouldReset, currentVersion] = shouldResetDatabase(dbPath);
        if (shouldReset) {
            logger.info("Resetting database due to schema changes", {
                currentVersion: currentVersion ?? "unknown",
                expectedVersion: EXPECTED_SCHEMA_VERSION,
            });
            resetDatabase(dbPath);
        }

        dbInstance = new Database(dbPath, { create: true });
        initializeDatabase(dbInstance);
    }
    return dbInstance;
}

/**
 * Initialize database schema
 */
function initializeDatabase(db: Database): void {
    // Create bibliographic_info table with search-optimized columns
    // Note: This creates the table with all columns including NDL metadata
    // Column names match NDL API naming for consistency
    db.run(`
        CREATE TABLE IF NOT EXISTS bibliographic_info (
            isbn TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            title_kana TEXT,
            link TEXT,
            creators TEXT NOT NULL,
            creators_kana TEXT,
            publisher TEXT,
            pub_year TEXT,
            issued TEXT,
            extent TEXT,
            price TEXT,
            ndc10 TEXT,
            ndlc TEXT,
            ndl_bib_id TEXT,
            jpno TEXT,
            tohan_marc_no TEXT,
            subjects TEXT,
            categories TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Run database migrations for existing tables
    runMigrations(db);

    // Create indexes for efficient searching
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_bibliographic_updated_at
        ON bibliographic_info(updated_at)
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_bibliographic_title
        ON bibliographic_info(title)
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_bibliographic_publisher
        ON bibliographic_info(publisher)
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_bibliographic_pub_year
        ON bibliographic_info(pub_year)
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_bibliographic_ndc10
        ON bibliographic_info(ndc10)
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_bibliographic_ndlc
        ON bibliographic_info(ndlc)
    `);

    // Create FTS5 virtual table for full-text search
    // Using unicode61 tokenizer with remove_diacritics for better Japanese support
    // Column names match NDL API naming
    db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS bibliographic_fts USING fts5(
            isbn UNINDEXED,
            title,
            title_kana,
            creators,
            creators_kana,
            publisher,
            content='bibliographic_info',
            content_rowid='rowid',
            tokenize='unicode61 remove_diacritics 2'
        )
    `);

    // Create triggers to keep FTS table in sync
    // Drop old triggers first to ensure they match new schema
    db.run(`DROP TRIGGER IF EXISTS bibliographic_fts_insert`);
    db.run(`DROP TRIGGER IF EXISTS bibliographic_fts_delete`);
    db.run(`DROP TRIGGER IF EXISTS bibliographic_fts_update`);

    db.run(`
        CREATE TRIGGER bibliographic_fts_insert
        AFTER INSERT ON bibliographic_info BEGIN
            INSERT INTO bibliographic_fts(rowid, isbn, title, title_kana, creators, creators_kana, publisher)
            VALUES (new.rowid, new.isbn, new.title, new.title_kana, new.creators, new.creators_kana, new.publisher);
        END
    `);

    db.run(`
        CREATE TRIGGER bibliographic_fts_delete
        AFTER DELETE ON bibliographic_info BEGIN
            DELETE FROM bibliographic_fts WHERE rowid = old.rowid;
        END
    `);

    // NOTE: UPDATE trigger is NOT created because we manually manage FTS5 on updates
    // to work around bun:sqlite v1.3.2 FTS5 UPDATE trigger bug
}

/**
 * Insert or update bibliographic information
 *
 * This implementation manually manages FTS5 index on UPDATE to work around
 * bun:sqlite v1.3.2 FTS5 UPDATE trigger bug where DELETE doesn't execute properly.
 *
 * For INSERT operations, we rely on the INSERT trigger which works correctly.
 * For UPDATE operations, we manually delete old FTS5 entry and insert new one.
 */
export function upsertBibliographicInfo(
    db: Database,
    info: BibliographicInfo
): void {
    // Transaction ensures atomicity across all operations
    db.run("BEGIN TRANSACTION");

    try {
        // Check if record already exists
        const existingRow = db
            .prepare("SELECT rowid FROM bibliographic_info WHERE isbn = ?")
            .get(info.isbn) as { rowid: number } | undefined;

        if (existingRow) {
            // UPDATE path: use DELETE+INSERT instead of UPDATE to avoid FTS5 issues
            // This approach completely avoids UPDATE triggers and FTS5 sync problems

            // 1. Delete from FTS5 first
            db.prepare("DELETE FROM bibliographic_fts WHERE rowid = ?").run(
                existingRow.rowid
            );

            // 2. Delete from main table
            db.prepare("DELETE FROM bibliographic_info WHERE isbn = ?").run(
                info.isbn
            );

            // 3. Insert new record (INSERT trigger will handle FTS5)
            db.prepare(`
                INSERT INTO bibliographic_info (
                    isbn, title, title_kana, link, creators, creators_kana,
                    publisher, pub_year, issued, extent, price,
                    ndc10, ndlc, ndl_bib_id, jpno, tohan_marc_no,
                    subjects, categories, description, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                info.isbn,
                info.title,
                info.title_kana || null,
                info.link || null,
                JSON.stringify(info.creators),
                info.creators_kana ? JSON.stringify(info.creators_kana) : null,
                info.publisher,
                info.pub_year,
                info.issued || null,
                info.extent || null,
                info.price || null,
                info.ndc10,
                info.ndlc,
                info.ndl_bib_id || null,
                info.jpno || null,
                info.tohan_marc_no || null,
                info.subjects ? JSON.stringify(info.subjects) : null,
                info.categories ? JSON.stringify(info.categories) : null,
                info.description || null
            );
        } else {
            // INSERT path: use trigger (works correctly)
            db.prepare(`
                INSERT INTO bibliographic_info (
                    isbn, title, title_kana, link, creators, creators_kana,
                    publisher, pub_year, issued, extent, price,
                    ndc10, ndlc, ndl_bib_id, jpno, tohan_marc_no,
                    subjects, categories, description, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                info.isbn,
                info.title,
                info.title_kana || null,
                info.link || null,
                JSON.stringify(info.creators),
                info.creators_kana ? JSON.stringify(info.creators_kana) : null,
                info.publisher,
                info.pub_year,
                info.issued || null,
                info.extent || null,
                info.price || null,
                info.ndc10,
                info.ndlc,
                info.ndl_bib_id || null,
                info.jpno || null,
                info.tohan_marc_no || null,
                info.subjects ? JSON.stringify(info.subjects) : null,
                info.categories ? JSON.stringify(info.categories) : null,
                info.description || null
            );
        }

        db.run("COMMIT");
    } catch (error) {
        db.run("ROLLBACK");
        throw error;
    }
}

/**
 * Get bibliographic information by ISBN
 */
export function getBibliographicInfo(
    db: Database,
    isbn: string
): BibliographicInfo | null {
    const stmt = db.prepare(
        "SELECT * FROM bibliographic_info WHERE isbn = ?"
    );
    const row = stmt.get(isbn) as BibliographicRecord | null;

    if (!row) return null;

    return {
        isbn: row.isbn,
        title: row.title,
        title_kana: row.title_kana,
        link: row.link,
        creators: JSON.parse(row.creators) as string[],
        creators_kana: row.creators_kana
            ? (JSON.parse(row.creators_kana) as string[])
            : undefined,
        publisher: row.publisher,
        pub_year: row.pub_year,
        issued: row.issued,
        extent: row.extent,
        price: row.price,
        ndc10: row.ndc10,
        ndlc: row.ndlc,
        ndl_bib_id: row.ndl_bib_id,
        jpno: row.jpno,
        tohan_marc_no: row.tohan_marc_no,
        subjects: row.subjects ? (JSON.parse(row.subjects) as string[]) : undefined,
        categories: row.categories ? (JSON.parse(row.categories) as string[]) : undefined,
        description: row.description,
    };
}

/**
 * Get bibliographic information for multiple ISBNs
 */
export function getBibliographicInfoBatch(
    db: Database,
    isbns: string[]
): BibliographicInfo[] {
    if (isbns.length === 0) return [];

    const placeholders = isbns.map(() => "?").join(",");
    const stmt = db.prepare(
        `SELECT * FROM bibliographic_info WHERE isbn IN (${placeholders})`
    );
    const rows = stmt.all(...isbns) as BibliographicRecord[];

    return rows.map((row) => ({
        isbn: row.isbn,
        title: row.title,
        title_kana: row.title_kana,
        link: row.link,
        creators: JSON.parse(row.creators) as string[],
        creators_kana: row.creators_kana
            ? (JSON.parse(row.creators_kana) as string[])
            : undefined,
        publisher: row.publisher,
        pub_year: row.pub_year,
        issued: row.issued,
        extent: row.extent,
        price: row.price,
        ndc10: row.ndc10,
        ndlc: row.ndlc,
        ndl_bib_id: row.ndl_bib_id,
        jpno: row.jpno,
        tohan_marc_no: row.tohan_marc_no,
        subjects: row.subjects ? (JSON.parse(row.subjects) as string[]) : undefined,
        categories: row.categories ? (JSON.parse(row.categories) as string[]) : undefined,
        description: row.description,
    }));
}

/**
 * Search bibliographic information with flexible criteria
 * Supports full-text search and field-specific filtering
 */
export function searchBibliographic(
    db: Database,
    options: SearchOptions
): BibliographicInfo[] {
    const {
        query,
        title,
        author,
        publisher,
        isbn,
        ndc10,
        ndlc,
        yearFrom,
        yearTo,
        limit = 100,
        offset = 0,
    } = options;

    let sql: string;
    const params: any[] = [];

    // Use FTS5 for full-text search if query is provided
    if (query) {
        sql = `
            SELECT b.*
            FROM bibliographic_info b
            INNER JOIN bibliographic_fts fts ON b.rowid = fts.rowid
            WHERE bibliographic_fts MATCH ?
        `;
        params.push(query);

        // Add additional filters
        if (isbn) {
            sql += " AND b.isbn LIKE ?";
            params.push(`%${isbn}%`);
        }
        if (ndc10) {
            sql += " AND b.ndc10 LIKE ?";
            params.push(`%${ndc10}%`);
        }
        if (ndlc) {
            sql += " AND b.ndlc LIKE ?";
            params.push(`%${ndlc}%`);
        }
        if (yearFrom) {
            sql += " AND b.pub_year >= ?";
            params.push(yearFrom);
        }
        if (yearTo) {
            sql += " AND b.pub_year <= ?";
            params.push(yearTo);
        }
    } else {
        // Build SQL query with WHERE conditions
        sql = "SELECT * FROM bibliographic_info WHERE 1=1";

        if (title) {
            sql += " AND (title LIKE ? OR title_kana LIKE ?)";
            params.push(`%${title}%`, `%${title}%`);
        }
        if (author) {
            sql += " AND (creators LIKE ? OR creators_kana LIKE ?)";
            params.push(`%${author}%`, `%${author}%`);
        }
        if (publisher) {
            sql += " AND publisher LIKE ?";
            params.push(`%${publisher}%`);
        }
        if (isbn) {
            sql += " AND isbn LIKE ?";
            params.push(`%${isbn}%`);
        }
        if (ndc10) {
            sql += " AND ndc10 LIKE ?";
            params.push(`%${ndc10}%`);
        }
        if (ndlc) {
            sql += " AND ndlc LIKE ?";
            params.push(`%${ndlc}%`);
        }
        if (yearFrom) {
            sql += " AND pub_year >= ?";
            params.push(yearFrom);
        }
        if (yearTo) {
            sql += " AND pub_year <= ?";
            params.push(yearTo);
        }
    }

    // Add ordering and pagination
    sql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as BibliographicRecord[];

    return rows.map((row) => ({
        isbn: row.isbn,
        title: row.title,
        title_kana: row.title_kana,
        link: row.link,
        creators: JSON.parse(row.creators) as string[],
        creators_kana: row.creators_kana
            ? (JSON.parse(row.creators_kana) as string[])
            : undefined,
        publisher: row.publisher,
        pub_year: row.pub_year,
        issued: row.issued,
        extent: row.extent,
        price: row.price,
        ndc10: row.ndc10,
        ndlc: row.ndlc,
        ndl_bib_id: row.ndl_bib_id,
        jpno: row.jpno,
        tohan_marc_no: row.tohan_marc_no,
        subjects: row.subjects ? (JSON.parse(row.subjects) as string[]) : undefined,
        categories: row.categories ? (JSON.parse(row.categories) as string[]) : undefined,
        description: row.description,
    }));
}

/**
 * Count search results for pagination
 */
export function countSearchResults(
    db: Database,
    options: SearchOptions
): number {
    const { query, title, author, publisher, isbn, ndc10, ndlc, yearFrom, yearTo } = options;

    let sql: string;
    const params: any[] = [];

    // Use FTS5 for full-text search if query is provided
    if (query) {
        sql = `
            SELECT COUNT(*) as count
            FROM bibliographic_info b
            INNER JOIN bibliographic_fts fts ON b.rowid = fts.rowid
            WHERE bibliographic_fts MATCH ?
        `;
        params.push(query);

        // Add additional filters
        if (isbn) {
            sql += " AND b.isbn LIKE ?";
            params.push(`%${isbn}%`);
        }
        if (ndc10) {
            sql += " AND b.ndc10 LIKE ?";
            params.push(`%${ndc10}%`);
        }
        if (ndlc) {
            sql += " AND b.ndlc LIKE ?";
            params.push(`%${ndlc}%`);
        }
        if (yearFrom) {
            sql += " AND b.pub_year >= ?";
            params.push(yearFrom);
        }
        if (yearTo) {
            sql += " AND b.pub_year <= ?";
            params.push(yearTo);
        }
    } else {
        sql = "SELECT COUNT(*) as count FROM bibliographic_info WHERE 1=1";

        if (title) {
            sql += " AND (title LIKE ? OR title_kana LIKE ?)";
            params.push(`%${title}%`, `%${title}%`);
        }
        if (author) {
            sql += " AND (creators LIKE ? OR creators_kana LIKE ?)";
            params.push(`%${author}%`, `%${author}%`);
        }
        if (publisher) {
            sql += " AND publisher LIKE ?";
            params.push(`%${publisher}%`);
        }
        if (isbn) {
            sql += " AND isbn LIKE ?";
            params.push(`%${isbn}%`);
        }
        if (ndc10) {
            sql += " AND ndc10 LIKE ?";
            params.push(`%${ndc10}%`);
        }
        if (ndlc) {
            sql += " AND ndlc LIKE ?";
            params.push(`%${ndlc}%`);
        }
        if (yearFrom) {
            sql += " AND pub_year >= ?";
            params.push(yearFrom);
        }
        if (yearTo) {
            sql += " AND pub_year <= ?";
            params.push(yearTo);
        }
    }

    const stmt = db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
}

/**
 * Get all unique NDC10 classifications
 */
export function getAllNDC10Classifications(db: Database): string[] {
    const stmt = db.prepare(`
        SELECT DISTINCT ndc10
        FROM bibliographic_info
        WHERE ndc10 IS NOT NULL
        ORDER BY ndc10
    `);
    const rows = stmt.all() as { ndc10: string }[];
    return rows.map((row) => row.ndc10);
}

/**
 * Get all unique NDLC classifications
 */
export function getAllNDLCClassifications(db: Database): string[] {
    const stmt = db.prepare(`
        SELECT DISTINCT ndlc
        FROM bibliographic_info
        WHERE ndlc IS NOT NULL
        ORDER BY ndlc
    `);
    const rows = stmt.all() as { ndlc: string }[];
    return rows.map((row) => row.ndlc);
}

/**
 * Get all unique publishers
 */
export function getAllPublishers(db: Database): string[] {
    const stmt = db.prepare(`
        SELECT DISTINCT publisher
        FROM bibliographic_info
        WHERE publisher IS NOT NULL
        ORDER BY publisher
    `);
    const rows = stmt.all() as { publisher: string }[];
    return rows.map((row) => row.publisher);
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}
