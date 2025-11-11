import { Database } from "bun:sqlite";
import { getAppDataDir } from "../../../shared/config/app-paths";
import path from "node:path";

export type BibliographicRecord = {
    isbn: string;
    title: string;
    authors: string; // JSON array string
    publisher: string | null;
    pub_year: string | null;
    ndc10: string | null;
    ndlc: string | null;
    created_at: string;
    updated_at: string;
};

export type BibliographicInfo = {
    isbn: string;
    title: string;
    authors: string[];
    publisher: string | null;
    pub_year: string | null;
    ndc10: string | null;
    ndlc: string | null;
};

let dbInstance: Database | null = null;

/**
 * Get or create database instance (singleton)
 */
export function getDatabase(): Database {
    if (!dbInstance) {
        const appDataDir = getAppDataDir();
        const dbPath = path.join(appDataDir, "bibliographic.db");

        dbInstance = new Database(dbPath, { create: true });
        initializeDatabase(dbInstance);
    }
    return dbInstance;
}

/**
 * Initialize database schema
 */
function initializeDatabase(db: Database): void {
    // Create bibliographic_info table
    db.run(`
        CREATE TABLE IF NOT EXISTS bibliographic_info (
            isbn TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            authors TEXT NOT NULL,
            publisher TEXT,
            pub_year TEXT,
            ndc10 TEXT,
            ndlc TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create index on updated_at for efficient queries
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_bibliographic_updated_at
        ON bibliographic_info(updated_at)
    `);

    console.log("Bibliographic database initialized");
}

/**
 * Insert or update bibliographic information
 */
export function upsertBibliographicInfo(
    db: Database,
    info: BibliographicInfo
): void {
    const stmt = db.prepare(`
        INSERT INTO bibliographic_info (isbn, title, authors, publisher, pub_year, ndc10, ndlc, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(isbn) DO UPDATE SET
            title = excluded.title,
            authors = excluded.authors,
            publisher = excluded.publisher,
            pub_year = excluded.pub_year,
            ndc10 = excluded.ndc10,
            ndlc = excluded.ndlc,
            updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
        info.isbn,
        info.title,
        JSON.stringify(info.authors),
        info.publisher,
        info.pub_year,
        info.ndc10,
        info.ndlc
    );
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
        authors: JSON.parse(row.authors) as string[],
        publisher: row.publisher,
        pub_year: row.pub_year,
        ndc10: row.ndc10,
        ndlc: row.ndlc,
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
        authors: JSON.parse(row.authors) as string[],
        publisher: row.publisher,
        pub_year: row.pub_year,
        ndc10: row.ndc10,
        ndlc: row.ndlc,
    }));
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
