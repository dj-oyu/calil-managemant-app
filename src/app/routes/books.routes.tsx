import { Hono } from "hono";
import { raw } from "hono/html";
import {
    fetchBookList,
    fetchBookListMetadata,
    fetchBookListPage,
} from "../../features/calil/api/fetch-list";
import {
    NDLsearch,
    convertISBN10to13,
} from "../../features/ndl/utility";
import { logger } from "../../shared/logging/logger";
import { getCacheHeaders } from "../utils/cache-headers";
import { isDevelopment } from "../utils/environment";
import { BookCard, BookDetail } from "../components/books";
import {
    getDatabase,
    getBibliographicInfo,
    upsertBibliographicInfo,
} from "../../features/bibliographic/db/schema";

export const booksRoutes = new Hono();

// APIエンドポイント: 書籍リスト取得（ページネーション対応ストリーミング版）
// Query params: maxPages (optional, default: all pages)
booksRoutes.get("/book-list-stream/:listType", async (c) => {
    const listType = c.req.param("listType") as "wish" | "read";
    const maxPagesParam = c.req.query("maxPages");
    const maxPages = maxPagesParam ? parseInt(maxPagesParam, 10) : undefined;

    logger.info("API: book-list-stream request received", {
        listType,
        maxPages,
    });

    if (listType !== "wish" && listType !== "read") {
        logger.warn("API: Invalid list type", { listType });
        return c.json({ error: "Invalid list type" }, 400);
    }

    // ストリーミングレスポンスを作成
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();

            try {
                // 1. まずメタデータを取得して送信
                logger.info("API: Fetching metadata", { listType });
                const metadata = await fetchBookListMetadata(listType);

                const metaMessage =
                    JSON.stringify({
                        type: "meta",
                        totalCount: metadata.totalCount,
                        totalPages: metadata.totalPages,
                        pageSize: metadata.pageSize,
                    }) + "\n";
                controller.enqueue(encoder.encode(metaMessage));
                logger.info("API: Sent metadata", { listType, metadata });

                // 2. ページを1つずつストリーミング
                const pagesToFetch = maxPages
                    ? Math.min(maxPages, metadata.totalPages)
                    : metadata.totalPages;

                for (let page = 1; page <= pagesToFetch; page++) {
                    logger.info("API: Fetching page", {
                        listType,
                        page,
                        pagesToFetch,
                    });
                    const books = await fetchBookListPage(listType, page);

                    // 各ページのHTMLを個別に送信
                    const pageHtml = books
                        .map((book) => {
                            const htmlElement = <BookCard book={book} />;
                            return htmlElement.toString();
                        })
                        .join("");

                    const pageMessage =
                        JSON.stringify({
                            type: "page",
                            pageNumber: page,
                            html: pageHtml,
                        }) + "\n";
                    controller.enqueue(encoder.encode(pageMessage));
                    logger.info("API: Sent page", {
                        listType,
                        page,
                        bookCount: books.length,
                    });
                }

                // 3. 完了を通知
                const doneMessage = JSON.stringify({ type: "done" }) + "\n";
                controller.enqueue(encoder.encode(doneMessage));
                logger.info("API: Stream completed", {
                    listType,
                    pagesSent: pagesToFetch,
                });

                controller.close();
            } catch (error) {
                logger.error("API: Streaming error", {
                    listType,
                    error: String(error),
                });
                const errorMessage =
                    JSON.stringify({
                        type: "error",
                        value: "サーバーエラーが発生しました。",
                    }) + "\n";
                controller.enqueue(encoder.encode(errorMessage));
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: getCacheHeaders(
            "application/x-ndjson",
            31536000,
            isDevelopment,
        ),
    });
});

// APIエンドポイント: 単一ページ取得（無限スクロール用）
booksRoutes.get("/book-list-page/:listType/:page", async (c) => {
    const listType = c.req.param("listType") as "wish" | "read";
    const page = parseInt(c.req.param("page"), 10);

    logger.info("API: book-list-page request received", { listType, page });

    if (listType !== "wish" && listType !== "read") {
        logger.warn("API: Invalid list type", { listType });
        return c.json({ error: "Invalid list type" }, 400);
    }

    if (isNaN(page) || page < 1) {
        logger.warn("API: Invalid page number", { page });
        return c.json({ error: "Invalid page number" }, 400);
    }

    try {
        logger.info("API: Fetching single page", { listType, page });
        const books = await fetchBookListPage(listType, page);

        logger.info("API: Page fetched successfully", {
            listType,
            page,
            count: books.length,
        });

        // BookCardコンポーネントをHTMLとして返す
        const htmlElements = books.map((book) => <BookCard book={book} />);
        const html = htmlElements.map((el) => el.toString()).join("");

        return c.html(raw(html));
    } catch (error) {
        logger.error("API: Failed to fetch page", {
            listType,
            page,
            error: String(error),
        });
        return c.json({ error: "Failed to fetch page" }, 500);
    }
});

// APIエンドポイント: 書籍詳細取得（通常のHTMLレスポンス）
booksRoutes.get("/books/:isbn", async (c) => {
    const isbn = c.req.param("isbn");

    logger.info("API: 書誌詳細取得リクエスト", { isbn });

    // Search with DB cache support
    const detail = await NDLsearch(
        isbn,
        getDatabase(),
        getBibliographicInfo,
        upsertBibliographicInfo,
    );

    if (!detail || detail[0] == null) {
        logger.warn("API: 書誌情報が見つかりません", { isbn });
        return c.html(<div>詳細情報が見つかりませんでした。</div>);
    }

    const item = detail[0];

    // Log parsed data summary
    const summary = {
        title: item.title || null,
        isbn13: item.isbn13 || null,
        publisher: item.publisher || null,
        pubYear: item.pubYear || null,
        ndc10: item.ndc10 || null,
        hasDescription: !!item.descriptionHtml,
    };
    logger.info("API: 書誌詳細取得完了", summary);

    return c.html(<BookDetail item={item} />);
});
