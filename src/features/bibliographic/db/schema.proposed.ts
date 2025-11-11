/**
 * 提案: トリガーレスupsert実装
 *
 * bun:sqlite v1.3.2のFTS5 UPDATEトリガーバグを回避するため、
 * アプリケーション側で明示的にFTS5インデックスを管理する実装案
 */

import { Database } from "bun:sqlite";

export interface BibliographicInfo {
    isbn: string;
    title: string;
    title_kana?: string | null;
    authors: string[];
    authors_kana?: string[] | null;
    publisher?: string | null;
    pub_year?: string | null;
    ndc10?: string | null;
    ndlc?: string | null;
}

/**
 * 提案1: トリガーレスupsert（推奨）
 *
 * メリット:
 * - トリガーバグの影響を受けない
 * - FTS5の状態を完全に制御できる
 * - テストが完全に網羅可能
 * - デバッグが容易
 *
 * デメリット:
 * - コードが若干長くなる
 * - トランザクション管理が必要
 */
export function upsertBibliographicInfo_Triggerless(
    db: Database,
    info: BibliographicInfo
): void {
    // トランザクションで実行（整合性を保証）
    db.run("BEGIN TRANSACTION");

    try {
        // 既存レコードのrowidを取得
        const existingRow = db.prepare(
            "SELECT rowid FROM bibliographic_info WHERE isbn = ?"
        ).get(info.isbn) as { rowid: number } | undefined;

        if (existingRow) {
            // UPDATE処理
            // 1. FTS5から古いインデックスを削除
            db.prepare(
                "DELETE FROM bibliographic_fts WHERE rowid = ?"
            ).run(existingRow.rowid);

            // 2. メインテーブルを更新
            db.prepare(`
                UPDATE bibliographic_info SET
                    title = ?,
                    title_kana = ?,
                    authors = ?,
                    authors_kana = ?,
                    publisher = ?,
                    pub_year = ?,
                    ndc10 = ?,
                    ndlc = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE isbn = ?
            `).run(
                info.title,
                info.title_kana || null,
                JSON.stringify(info.authors),
                info.authors_kana ? JSON.stringify(info.authors_kana) : null,
                info.publisher,
                info.pub_year,
                info.ndc10,
                info.ndlc,
                info.isbn
            );

            // 3. FTS5に新しいインデックスを追加
            db.prepare(`
                INSERT INTO bibliographic_fts(rowid, isbn, title, title_kana, authors, authors_kana, publisher)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                existingRow.rowid,
                info.isbn,
                info.title,
                info.title_kana || null,
                JSON.stringify(info.authors),
                info.authors_kana ? JSON.stringify(info.authors_kana) : null,
                info.publisher
            );
        } else {
            // INSERT処理
            // メインテーブルに挿入（トリガーでFTS5に自動追加される）
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
 * 提案2: トリガー無効化版upsert
 *
 * メリット:
 * - 完全にトリガーに依存しない
 * - より明示的な制御
 *
 * デメリット:
 * - INSERT/UPDATE両方でFTS5を手動管理
 * - コードの重複が多い
 */
export function upsertBibliographicInfo_NoTriggers(
    db: Database,
    info: BibliographicInfo
): void {
    db.run("BEGIN TRANSACTION");

    try {
        const existingRow = db.prepare(
            "SELECT rowid FROM bibliographic_info WHERE isbn = ?"
        ).get(info.isbn) as { rowid: number } | undefined;

        if (existingRow) {
            // UPDATE処理
            db.prepare(
                "DELETE FROM bibliographic_fts WHERE rowid = ?"
            ).run(existingRow.rowid);

            db.prepare(`
                UPDATE bibliographic_info SET
                    title = ?,
                    title_kana = ?,
                    authors = ?,
                    authors_kana = ?,
                    publisher = ?,
                    pub_year = ?,
                    ndc10 = ?,
                    ndlc = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE isbn = ?
            `).run(
                info.title,
                info.title_kana || null,
                JSON.stringify(info.authors),
                info.authors_kana ? JSON.stringify(info.authors_kana) : null,
                info.publisher,
                info.pub_year,
                info.ndc10,
                info.ndlc,
                info.isbn
            );

            db.prepare(`
                INSERT INTO bibliographic_fts(rowid, isbn, title, title_kana, authors, authors_kana, publisher)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                existingRow.rowid,
                info.isbn,
                info.title,
                info.title_kana || null,
                JSON.stringify(info.authors),
                info.authors_kana ? JSON.stringify(info.authors_kana) : null,
                info.publisher
            );
        } else {
            // INSERT処理（トリガーを使わずに手動でFTS5も挿入）
            const result = db.prepare(`
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

            // 手動でFTS5に挿入
            db.prepare(`
                INSERT INTO bibliographic_fts(rowid, isbn, title, title_kana, authors, authors_kana, publisher)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                result.lastInsertRowid,
                info.isbn,
                info.title,
                info.title_kana || null,
                JSON.stringify(info.authors),
                info.authors_kana ? JSON.stringify(info.authors_kana) : null,
                info.publisher
            );
        }

        db.run("COMMIT");
    } catch (error) {
        db.run("ROLLBACK");
        throw error;
    }
}

/**
 * 提案3: ハイブリッド実装（最もバランスが良い）
 *
 * INSERT時はトリガーを活用（シンプル）
 * UPDATE時は手動管理（バグ回避）
 *
 * メリット:
 * - INSERTトリガーは正常動作するので活用
 * - UPDATEのみ手動管理でバグ回避
 * - コードがシンプル
 * - パフォーマンスも良好
 *
 * デメリット:
 * - 部分的にトリガーに依存
 */
export function upsertBibliographicInfo_Hybrid(
    db: Database,
    info: BibliographicInfo
): void {
    // 既存レコードの確認
    const existingRow = db.prepare(
        "SELECT rowid FROM bibliographic_info WHERE isbn = ?"
    ).get(info.isbn) as { rowid: number } | undefined;

    if (existingRow) {
        // UPDATE処理のみトランザクションとFTS5手動管理
        db.run("BEGIN TRANSACTION");
        try {
            // 1. FTS5から削除
            db.prepare(
                "DELETE FROM bibliographic_fts WHERE rowid = ?"
            ).run(existingRow.rowid);

            // 2. メインテーブル更新（UPDATEトリガーは使わない）
            db.prepare(`
                UPDATE bibliographic_info SET
                    title = ?,
                    title_kana = ?,
                    authors = ?,
                    authors_kana = ?,
                    publisher = ?,
                    pub_year = ?,
                    ndc10 = ?,
                    ndlc = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE isbn = ?
            `).run(
                info.title,
                info.title_kana || null,
                JSON.stringify(info.authors),
                info.authors_kana ? JSON.stringify(info.authors_kana) : null,
                info.publisher,
                info.pub_year,
                info.ndc10,
                info.ndlc,
                info.isbn
            );

            // 3. FTS5に再挿入
            db.prepare(`
                INSERT INTO bibliographic_fts(rowid, isbn, title, title_kana, authors, authors_kana, publisher)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                existingRow.rowid,
                info.isbn,
                info.title,
                info.title_kana || null,
                JSON.stringify(info.authors),
                info.authors_kana ? JSON.stringify(info.authors_kana) : null,
                info.publisher
            );

            db.run("COMMIT");
        } catch (error) {
            db.run("ROLLBACK");
            throw error;
        }
    } else {
        // INSERT処理はトリガーに任せる（正常動作）
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
}

/**
 * 比較表
 *
 * | 項目 | 現在の実装 | 提案1 | 提案2 | 提案3（推奨） |
 * |------|-----------|-------|-------|--------------|
 * | トリガー依存 | 完全依存 | 部分依存 | 依存なし | 部分依存 |
 * | バグ影響 | ❌ 受ける | ✅ 回避 | ✅ 回避 | ✅ 回避 |
 * | テスト網羅性 | ❌ 不完全 | ✅ 完全 | ✅ 完全 | ✅ 完全 |
 * | コードの複雑さ | シンプル | 中程度 | 複雑 | 中程度 |
 * | パフォーマンス | 高速 | 高速 | 中速 | 高速 |
 * | メンテナンス性 | 低 | 高 | 中 | 高 |
 * | 推奨度 | - | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
 */
