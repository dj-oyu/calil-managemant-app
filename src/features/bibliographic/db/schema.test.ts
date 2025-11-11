import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
    upsertBibliographicInfo,
    getBibliographicInfo,
    getBibliographicInfoBatch,
    searchBibliographic,
    countSearchResults,
    getAllNDC10Classifications,
    getAllNDLCClassifications,
    getAllPublishers,
    type BibliographicInfo,
} from "./schema";

// Create a temporary file-based database for testing
// Using file-based DB instead of :memory: to avoid bun:sqlite FTS5 trigger issues
function createTestDatabase(): Database {
    const tmpFile = path.join(tmpdir(), `test-bibliographic-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);
    return new Database(tmpFile, { create: true });
}

// Clean up temporary database file
function cleanupTestDatabase(db: Database): void {
    const filename = db.filename;
    db.close();
    if (filename && filename !== ":memory:" && existsSync(filename)) {
        unlinkSync(filename);
    }
}

// Initialize test database with schema
function initTestDatabase(db: Database): void {
    db.run(`
        CREATE TABLE bibliographic_info (
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

    db.run(`
        CREATE INDEX idx_bibliographic_updated_at ON bibliographic_info(updated_at)
    `);
    db.run(`
        CREATE INDEX idx_bibliographic_title ON bibliographic_info(title)
    `);
    db.run(`
        CREATE INDEX idx_bibliographic_publisher ON bibliographic_info(publisher)
    `);
    db.run(`
        CREATE INDEX idx_bibliographic_pub_year ON bibliographic_info(pub_year)
    `);
    db.run(`
        CREATE INDEX idx_bibliographic_ndc10 ON bibliographic_info(ndc10)
    `);
    db.run(`
        CREATE INDEX idx_bibliographic_ndlc ON bibliographic_info(ndlc)
    `);

    db.run(`
        CREATE VIRTUAL TABLE bibliographic_fts USING fts5(
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

    db.run(`
        CREATE TRIGGER bibliographic_fts_update
        AFTER UPDATE ON bibliographic_info BEGIN
            DELETE FROM bibliographic_fts WHERE rowid = old.rowid;
            INSERT INTO bibliographic_fts(rowid, isbn, title, title_kana, creators, creators_kana, publisher)
            VALUES (new.rowid, new.isbn, new.title, new.title_kana, new.creators, new.creators_kana, new.publisher);
        END
    `);
}

describe("BibliographicInfo Database", () => {
    let db: Database;

    beforeEach(() => {
        db = createTestDatabase();
        initTestDatabase(db);
    });

    afterEach(() => {
        cleanupTestDatabase(db);
    });

    describe("upsertBibliographicInfo", () => {
        test("should insert new bibliographic info", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "吾輩は猫である",
                title_kana: "ワガハイハネコデアル",
                creators: ["夏目漱石"],
                creators_kana: ["ナツメソウセキ"],
                publisher: "岩波書店",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            const result = getBibliographicInfo(db, "9784003101018");
            expect(result).not.toBeNull();
            expect(result?.title).toBe("吾輩は猫である");
            expect(result?.creators).toEqual(["夏目漱石"]);
            expect(result?.publisher).toBe("岩波書店");
        });

        test("should update existing bibliographic info", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "吾輩は猫である",
                creators: ["夏目漱石"],
                publisher: "岩波書店",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            // Update with new data
            const updatedInfo: BibliographicInfo = {
                ...info,
                title_kana: "ワガハイハネコデアル",
                creators_kana: ["ナツメソウセキ"],
            };

            upsertBibliographicInfo(db, updatedInfo);

            const result = getBibliographicInfo(db, "9784003101018");
            expect(result?.title_kana).toBe("ワガハイハネコデアル");
            expect(result?.creators_kana).toEqual(["ナツメソウセキ"]);
        });

        test("should handle null values", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "吾輩は猫である",
                creators: ["夏目漱石"],
                publisher: null,
                pub_year: null,
                ndc10: null,
                ndlc: null,
            };

            upsertBibliographicInfo(db, info);

            const result = getBibliographicInfo(db, "9784003101018");
            expect(result?.publisher).toBeNull();
            expect(result?.pub_year).toBeNull();
        });
    });

    describe("getBibliographicInfo", () => {
        test("should return null for non-existent ISBN", () => {
            const result = getBibliographicInfo(db, "9999999999999");
            expect(result).toBeNull();
        });

        test("should retrieve existing info", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "吾輩は猫である",
                creators: ["夏目漱石"],
                publisher: "岩波書店",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);
            const result = getBibliographicInfo(db, "9784003101018");

            expect(result?.isbn).toBe(info.isbn);
            expect(result?.title).toBe(info.title);
        });
    });

    describe("getBibliographicInfoBatch", () => {
        beforeEach(() => {
            const books: BibliographicInfo[] = [
                {
                    isbn: "9784003101018",
                    title: "吾輩は猫である",
                    creators: ["夏目漱石"],
                    publisher: "岩波書店",
                    pub_year: "2022",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784101010014",
                    title: "こころ",
                    creators: ["夏目漱石"],
                    publisher: "新潮社",
                    pub_year: "2021",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784041003084",
                    title: "羅生門",
                    creators: ["芥川龍之介"],
                    publisher: "角川書店",
                    pub_year: "2020",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
            ];

            books.forEach((book) => upsertBibliographicInfo(db, book));
        });

        test("should return empty array for empty input", () => {
            const result = getBibliographicInfoBatch(db, []);
            expect(result).toEqual([]);
        });

        test("should retrieve multiple books", () => {
            const isbns = ["9784003101018", "9784101010014"];
            const result = getBibliographicInfoBatch(db, isbns);

            expect(result).toHaveLength(2);
            expect(result.map((r) => r.isbn).sort()).toEqual(isbns.sort());
        });

        test("should handle mix of existing and non-existing ISBNs", () => {
            const isbns = ["9784003101018", "9999999999999"];
            const result = getBibliographicInfoBatch(db, isbns);

            expect(result).toHaveLength(1);
            expect(result[0].isbn).toBe("9784003101018");
        });
    });

    describe("searchBibliographic", () => {
        beforeEach(() => {
            const books: BibliographicInfo[] = [
                {
                    isbn: "9784003101018",
                    title: "吾輩は猫である",
                    title_kana: "ワガハイハネコデアル",
                    creators: ["夏目漱石"],
                    creators_kana: ["ナツメソウセキ"],
                    publisher: "岩波書店",
                    pub_year: "2022",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784101010014",
                    title: "こころ",
                    title_kana: "ココロ",
                    creators: ["夏目漱石"],
                    creators_kana: ["ナツメソウセキ"],
                    publisher: "新潮社",
                    pub_year: "2021",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784041003084",
                    title: "羅生門",
                    title_kana: "ラショウモン",
                    creators: ["芥川龍之介"],
                    creators_kana: ["アクタガワリュウノスケ"],
                    publisher: "角川書店",
                    pub_year: "2020",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
            ];

            books.forEach((book) => upsertBibliographicInfo(db, book));
        });

        test("should search by title", () => {
            const result = searchBibliographic(db, { title: "猫" });
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe("吾輩は猫である");
        });

        test("should search by title_kana", () => {
            const result = searchBibliographic(db, { title: "ココロ" });
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe("こころ");
        });

        test("should search by author", () => {
            const result = searchBibliographic(db, { author: "夏目" });
            expect(result).toHaveLength(2);
        });

        test("should search by author_kana", () => {
            const result = searchBibliographic(db, { author: "アクタガワ" });
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe("羅生門");
        });

        test("should search by publisher", () => {
            const result = searchBibliographic(db, { publisher: "岩波" });
            expect(result).toHaveLength(1);
            expect(result[0].publisher).toBe("岩波書店");
        });

        test("should search by ISBN partial match", () => {
            const result = searchBibliographic(db, { isbn: "9784003" });
            expect(result).toHaveLength(1);
        });

        test("should search by NDC10", () => {
            const result = searchBibliographic(db, { ndc10: "913.6" });
            expect(result).toHaveLength(3);
        });

        test("should search by year range", () => {
            const result = searchBibliographic(db, {
                yearFrom: "2021",
                yearTo: "2022",
            });
            expect(result).toHaveLength(2);
        });

        test("should search with full-text search (FTS5)", () => {
            const result = searchBibliographic(db, { query: "夏目漱石" });
            expect(result).toHaveLength(2);
        });

        test("should combine filters", () => {
            const result = searchBibliographic(db, {
                author: "夏目",
                yearFrom: "2022",
            });
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe("吾輩は猫である");
        });

        test("should respect limit and offset", () => {
            const result = searchBibliographic(db, {
                ndc10: "913.6",
                limit: 2,
                offset: 1,
            });
            expect(result).toHaveLength(2);
        });

        // FTS5 update integration test
        // With manual FTS5 management in upsert, this now works correctly
        test("should find updated data with FTS5 after update (integration test)", () => {
            // Insert initial data
            const initialInfo: BibliographicInfo = {
                isbn: "9784567890123",
                title: "元のタイトル",
                title_kana: "モトノタイトル",
                creators: ["元の著者"],
                creators_kana: ["モトノチョシャ"],
                publisher: "元の出版社",
                pub_year: "2020",
                ndc10: "000",
                ndlc: "TEST",
            };

            upsertBibliographicInfo(db, initialInfo);

            // Verify initial data is searchable
            const initialSearch = searchBibliographic(db, { query: "元の著者" });
            expect(initialSearch).toHaveLength(1);
            expect(initialSearch[0].isbn).toBe("9784567890123");

            // Update with new data
            const updatedInfo: BibliographicInfo = {
                ...initialInfo,
                title: "更新されたタイトル",
                creators: ["更新された著者"],
            };

            upsertBibliographicInfo(db, updatedInfo);

            // Verify FTS5 index was updated correctly
            const afterUpdateSearch = searchBibliographic(db, { query: "更新された著者" });
            expect(afterUpdateSearch).toHaveLength(1);
            expect(afterUpdateSearch[0].creators).toEqual(["更新された著者"]);

            // Old data should NOT be found (this fails in bun:sqlite v1.3.2)
            const oldDataSearch = searchBibliographic(db, { query: "元の著者" });
            expect(oldDataSearch).toHaveLength(0);
        });
    });

    describe("countSearchResults", () => {
        beforeEach(() => {
            const books: BibliographicInfo[] = [
                {
                    isbn: "9784003101018",
                    title: "吾輩は猫である",
                    creators: ["夏目漱石"],
                    publisher: "岩波書店",
                    pub_year: "2022",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784101010014",
                    title: "こころ",
                    creators: ["夏目漱石"],
                    publisher: "新潮社",
                    pub_year: "2021",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784041003084",
                    title: "羅生門",
                    creators: ["芥川龍之介"],
                    publisher: "角川書店",
                    pub_year: "2020",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
            ];

            books.forEach((book) => upsertBibliographicInfo(db, book));
        });

        test("should count all results", () => {
            const count = countSearchResults(db, {});
            expect(count).toBe(3);
        });

        test("should count filtered results", () => {
            const count = countSearchResults(db, { author: "夏目" });
            expect(count).toBe(2);
        });

        test("should count with year range", () => {
            const count = countSearchResults(db, {
                yearFrom: "2021",
                yearTo: "2022",
            });
            expect(count).toBe(2);
        });
    });

    describe("getAllNDC10Classifications", () => {
        test("should return empty array when no data", () => {
            const result = getAllNDC10Classifications(db);
            expect(result).toEqual([]);
        });

        test("should return unique NDC10 classifications", () => {
            const books: BibliographicInfo[] = [
                {
                    isbn: "9784003101018",
                    title: "吾輩は猫である",
                    creators: ["夏目漱石"],
                    publisher: "岩波書店",
                    pub_year: "2022",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784101010014",
                    title: "こころ",
                    creators: ["夏目漱石"],
                    publisher: "新潮社",
                    pub_year: "2021",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784000000001",
                    title: "数学の本",
                    creators: ["数学太郎"],
                    publisher: "数学出版",
                    pub_year: "2023",
                    ndc10: "410",
                    ndlc: "MA11",
                },
            ];

            books.forEach((book) => upsertBibliographicInfo(db, book));

            const result = getAllNDC10Classifications(db);
            expect(result).toHaveLength(2);
            expect(result).toContain("913.6");
            expect(result).toContain("410");
        });
    });

    describe("getAllNDLCClassifications", () => {
        test("should return empty array when no data", () => {
            const result = getAllNDLCClassifications(db);
            expect(result).toEqual([]);
        });

        test("should return unique NDLC classifications", () => {
            const books: BibliographicInfo[] = [
                {
                    isbn: "9784003101018",
                    title: "吾輩は猫である",
                    creators: ["夏目漱石"],
                    publisher: "岩波書店",
                    pub_year: "2022",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784000000001",
                    title: "数学の本",
                    creators: ["数学太郎"],
                    publisher: "数学出版",
                    pub_year: "2023",
                    ndc10: "410",
                    ndlc: "MA11",
                },
            ];

            books.forEach((book) => upsertBibliographicInfo(db, book));

            const result = getAllNDLCClassifications(db);
            expect(result).toHaveLength(2);
            expect(result).toContain("KH334");
            expect(result).toContain("MA11");
        });
    });

    describe("getAllPublishers", () => {
        test("should return empty array when no data", () => {
            const result = getAllPublishers(db);
            expect(result).toEqual([]);
        });

        test("should return unique publishers", () => {
            const books: BibliographicInfo[] = [
                {
                    isbn: "9784003101018",
                    title: "吾輩は猫である",
                    creators: ["夏目漱石"],
                    publisher: "岩波書店",
                    pub_year: "2022",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784101010014",
                    title: "こころ",
                    creators: ["夏目漱石"],
                    publisher: "新潮社",
                    pub_year: "2021",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784041003084",
                    title: "羅生門",
                    creators: ["芥川龍之介"],
                    publisher: "角川書店",
                    pub_year: "2020",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
            ];

            books.forEach((book) => upsertBibliographicInfo(db, book));

            const result = getAllPublishers(db);
            expect(result).toHaveLength(3);
            expect(result).toContain("岩波書店");
            expect(result).toContain("新潮社");
            expect(result).toContain("角川書店");
        });
    });

    describe("Transaction and Error Handling", () => {
        test("should rollback on error during update", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "吾輩は猫である",
                creators: ["夏目漱石"],
                publisher: "岩波書店",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            // Temporarily corrupt the database by dropping FTS table
            db.run("DROP TABLE bibliographic_fts");

            // Attempt to update should fail and rollback
            const updatedInfo: BibliographicInfo = {
                ...info,
                title: "新しいタイトル",
            };

            expect(() => upsertBibliographicInfo(db, updatedInfo)).toThrow();

            // Recreate FTS table for cleanup
            db.run(`
                CREATE VIRTUAL TABLE bibliographic_fts USING fts5(
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

            // Original data should still be intact (rollback worked)
            const result = getBibliographicInfo(db, "9784003101018");
            expect(result?.title).toBe("吾輩は猫である");
        });

        test("should handle constraint violations", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "吾輩は猫である",
                creators: ["夏目漱石"],
                publisher: "岩波書店",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            // Upsert with same ISBN should succeed (update)
            const updatedInfo: BibliographicInfo = {
                ...info,
                title: "吾輩は猫である 改訂版",
            };

            expect(() => upsertBibliographicInfo(db, updatedInfo)).not.toThrow();

            const result = getBibliographicInfo(db, "9784003101018");
            expect(result?.title).toBe("吾輩は猫である 改訂版");
        });
    });

    describe("Edge Cases", () => {
        test("should handle empty string values", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "吾輩は猫である",
                creators: [""],
                publisher: "",
                pub_year: "",
                ndc10: "",
                ndlc: "",
            };

            upsertBibliographicInfo(db, info);

            const result = getBibliographicInfo(db, "9784003101018");
            expect(result?.publisher).toBe("");
            expect(result?.creators).toEqual([""]);
        });

        test("should handle special characters in text", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "Title with \"quotes\" and 'apostrophes' & <tags>",
                creators: ["Author's Name", "名前（なまえ）"],
                publisher: "Publisher & Co.",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            const result = getBibliographicInfo(db, "9784003101018");
            expect(result?.title).toBe("Title with \"quotes\" and 'apostrophes' & <tags>");
            expect(result?.creators).toContain("名前（なまえ）");
        });

        test("should handle very long strings", () => {
            const longTitle = "あ".repeat(1000);
            const longCreator = "い".repeat(500);

            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: longTitle,
                creators: [longCreator],
                publisher: "出版社",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            const result = getBibliographicInfo(db, "9784003101018");
            expect(result?.title.length).toBe(1000);
            expect(result?.creators[0].length).toBe(500);
        });

        test("should handle multiple creators array", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "共著の本",
                creators: ["著者1", "著者2", "著者3", "著者4", "著者5"],
                creators_kana: ["チョシャ1", "チョシャ2", "チョシャ3", "チョシャ4", "チョシャ5"],
                publisher: "出版社",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            const result = getBibliographicInfo(db, "9784003101018");
            expect(result?.creators).toHaveLength(5);
            expect(result?.creators_kana).toHaveLength(5);
        });

        test("should handle Unicode characters (emoji, rare kanji)", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "📚本のタイトル🎌",
                creators: ["𠮷田太郎", "髙橋花子"],
                publisher: "🏢出版社",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            const result = getBibliographicInfo(db, "9784003101018");
            expect(result?.title).toBe("📚本のタイトル🎌");
            expect(result?.creators).toContain("𠮷田太郎");
        });
    });

    describe("FTS5 Advanced Search", () => {
        beforeEach(() => {
            const books: BibliographicInfo[] = [
                {
                    isbn: "9784003101018",
                    title: "吾輩は猫である",
                    title_kana: "ワガハイハネコデアル",
                    creators: ["夏目漱石"],
                    creators_kana: ["ナツメソウセキ"],
                    publisher: "岩波書店",
                    pub_year: "2022",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784101010014",
                    title: "こころ",
                    title_kana: "ココロ",
                    creators: ["夏目漱石"],
                    creators_kana: ["ナツメソウセキ"],
                    publisher: "新潮社",
                    pub_year: "2021",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
                {
                    isbn: "9784041003084",
                    title: "羅生門・鼻",
                    title_kana: "ラショウモン・ハナ",
                    creators: ["芥川龍之介"],
                    creators_kana: ["アクタガワリュウノスケ"],
                    publisher: "角川書店",
                    pub_year: "2020",
                    ndc10: "913.6",
                    ndlc: "KH334",
                },
            ];

            books.forEach((book) => upsertBibliographicInfo(db, book));
        });

        test("should search with single keyword", () => {
            const result = searchBibliographic(db, { query: "夏目漱石" });
            expect(result).toHaveLength(2);
        });

        test("should search with title keyword", () => {
            const result = searchBibliographic(db, { query: "羅生門" });
            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        test("should handle empty search query", () => {
            const result = searchBibliographic(db, { query: "" });
            // Empty query should return all results or none (implementation dependent)
            expect(Array.isArray(result)).toBe(true);
        });

        test("should handle search with no results", () => {
            const result = searchBibliographic(db, { query: "存在しない著者名" });
            expect(result).toHaveLength(0);
        });
    });

    describe("Batch Operations Performance", () => {
        test("should handle batch insert efficiently", () => {
            const books: BibliographicInfo[] = [];
            for (let i = 0; i < 100; i++) {
                books.push({
                    isbn: `978400000${i.toString().padStart(4, "0")}`,
                    title: `テスト本${i}`,
                    creators: [`著者${i}`],
                    publisher: "テスト出版社",
                    pub_year: "2022",
                    ndc10: "913.6",
                    ndlc: "KH334",
                });
            }

            const startTime = Date.now();
            books.forEach((book) => upsertBibliographicInfo(db, book));
            const duration = Date.now() - startTime;

            // Should complete in reasonable time (< 5 seconds for 100 records)
            expect(duration).toBeLessThan(5000);

            // Verify all inserted
            const result = getBibliographicInfoBatch(
                db,
                books.map((b) => b.isbn)
            );
            expect(result).toHaveLength(100);
        });

        test("should handle batch update efficiently", () => {
            // First insert
            const books: BibliographicInfo[] = [];
            for (let i = 0; i < 50; i++) {
                books.push({
                    isbn: `978400000${i.toString().padStart(4, "0")}`,
                    title: `テスト本${i}`,
                    creators: [`著者${i}`],
                    publisher: "テスト出版社",
                    pub_year: "2022",
                    ndc10: "913.6",
                    ndlc: "KH334",
                });
            }
            books.forEach((book) => upsertBibliographicInfo(db, book));

            // Then update all
            const startTime = Date.now();
            books.forEach((book) => {
                upsertBibliographicInfo(db, {
                    ...book,
                    title: `更新${book.title}`,
                });
            });
            const duration = Date.now() - startTime;

            // Should complete in reasonable time (< 10 seconds for 50 updates)
            expect(duration).toBeLessThan(10000);

            // Verify all updated
            const result = getBibliographicInfo(db, books[0].isbn);
            expect(result?.title).toContain("更新");
        });
    });

    describe("Data Integrity", () => {
        test("should maintain FTS5 and main table consistency", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "吾輩は猫である",
                creators: ["夏目漱石"],
                publisher: "岩波書店",
                pub_year: "2022",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            // Check main table
            const mainResult = getBibliographicInfo(db, "9784003101018");
            expect(mainResult).not.toBeNull();

            // Check FTS5 can find it
            const ftsResult = searchBibliographic(db, { query: "夏目漱石" });
            expect(ftsResult).toHaveLength(1);
            expect(ftsResult[0].isbn).toBe("9784003101018");
        });

        test("should maintain consistency after update", () => {
            const info: BibliographicInfo = {
                isbn: "9784003101018",
                title: "初期タイトル",
                creators: ["初期著者"],
                publisher: "初期出版社",
                pub_year: "2020",
                ndc10: "913.6",
                ndlc: "KH334",
            };

            upsertBibliographicInfo(db, info);

            // Verify initial insert
            const initialResult = searchBibliographic(db, { query: "初期著者" });
            expect(initialResult).toHaveLength(1);

            // Update once
            upsertBibliographicInfo(db, {
                ...info,
                title: "更新後タイトル",
                creators: ["更新後著者"],
            });

            // Should only find updated version
            const updatedResult = searchBibliographic(db, { query: "更新後著者" });
            expect(updatedResult).toHaveLength(1);

            // Old version should not be found
            const oldResult = searchBibliographic(db, { query: "初期著者" });
            expect(oldResult).toHaveLength(0);
        });
    });
});
