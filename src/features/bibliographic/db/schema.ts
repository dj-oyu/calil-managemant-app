import { Database } from "bun:sqlite";
import { appRoot } from "../../../shared/config/app-paths";
import path from "node:path";

export type BibliographicRecord = {
    isbn: string;
    title: string;
    title_kana: string | null;
    authors: string; // JSON array string
    authors_kana: string | null; // JSON array string
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
    title_kana?: string | null;
    authors: string[];
    authors_kana?: string[];
    publisher: string | null;
    pub_year: string | null;
    ndc10: string | null;
    ndlc: string | null;
};

export type SearchOptions = {
    query?: string; // Free text search across title, authors, publisher
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
 * Get or create database instance (singleton)
 */
export function getDatabase(): Database {
    if (!dbInstance) {
        const dbPath = path.join(appRoot, "bibliographic.db");

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
    db.run(`
        CREATE TABLE IF NOT EXISTS bibliographic_info (
            isbn TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            title_kana TEXT,
            authors TEXT NOT NULL,
            authors_kana TEXT,
            publisher TEXT,
            pub_year TEXT,
            ndc10 TEXT,
            ndlc TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

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
    db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS bibliographic_fts USING fts5(
            isbn UNINDEXED,
            title,
            title_kana,
            authors,
            authors_kana,
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
            INSERT INTO bibliographic_fts(rowid, isbn, title, title_kana, authors, authors_kana, publisher)
            VALUES (new.rowid, new.isbn, new.title, new.title_kana, new.authors, new.authors_kana, new.publisher);
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
                    isbn, title, title_kana, authors, authors_kana,
                    publisher, pub_year, ndc10, ndlc, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                info.isbn,
                info.title,
                info.title_kana || null,
                JSON.stringify(info.authors),
                info.authors_kana ? JSON.stringify(info.authors_kana) : null,
                info.publisher,
                info.pub_year,
                info.ndc10,
                info.ndlc
            );
        } else {
            // INSERT path: use trigger (works correctly)
            db.prepare(`
                INSERT INTO bibliographic_info (
                    isbn, title, title_kana, authors, authors_kana,
                    publisher, pub_year, ndc10, ndlc, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                info.isbn,
                info.title,
                info.title_kana || null,
                JSON.stringify(info.authors),
                info.authors_kana ? JSON.stringify(info.authors_kana) : null,
                info.publisher,
                info.pub_year,
                info.ndc10,
                info.ndlc
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
        authors: JSON.parse(row.authors) as string[],
        authors_kana: row.authors_kana
            ? (JSON.parse(row.authors_kana) as string[])
            : undefined,
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
        title_kana: row.title_kana,
        authors: JSON.parse(row.authors) as string[],
        authors_kana: row.authors_kana
            ? (JSON.parse(row.authors_kana) as string[])
            : undefined,
        publisher: row.publisher,
        pub_year: row.pub_year,
        ndc10: row.ndc10,
        ndlc: row.ndlc,
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
            sql += " AND (authors LIKE ? OR authors_kana LIKE ?)";
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
        authors: JSON.parse(row.authors) as string[],
        authors_kana: row.authors_kana
            ? (JSON.parse(row.authors_kana) as string[])
            : undefined,
        publisher: row.publisher,
        pub_year: row.pub_year,
        ndc10: row.ndc10,
        ndlc: row.ndlc,
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
            sql += " AND (authors LIKE ? OR authors_kana LIKE ?)";
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
