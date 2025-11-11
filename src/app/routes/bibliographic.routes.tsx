import { Hono } from "hono";
import { fetchBookList } from "../../features/calil/api/fetch-list";
import { convertISBN10to13, NDLsearch } from "../../features/ndl/utility";
import { logger } from "../../shared/logging/logger";
import {
    getDatabase,
    getBibliographicInfo,
    getBibliographicInfoBatch,
    upsertBibliographicInfo,
    searchBibliographic,
    countSearchResults,
    getAllNDC10Classifications,
    getAllNDLCClassifications,
    getAllPublishers,
    type BibliographicInfo,
    type SearchOptions,
} from "../../features/bibliographic/db/schema";

export const bibliographicRoutes = new Hono();

// APIエンドポイント: 書誌情報のJSONダウンロード
bibliographicRoutes.get("/download/bibliographic/:listType", async (c) => {
    const listType = c.req.param("listType") as "wish" | "read";

    if (listType !== "wish" && listType !== "read") {
        logger.warn("API: Invalid list type for download", { listType });
        return c.json({ error: "Invalid list type" }, 400);
    }

    logger.info("API: 書誌情報JSONダウンロードリクエスト", { listType });

    try {
        // Fetch all books from the list
        const books = await fetchBookList(listType);
        logger.info("API: 蔵書リスト取得完了", {
            listType,
            count: books.length,
        });

        // Convert ISBN10 to ISBN13 and collect valid ISBNs
        const isbn13List = books
            .map((book) => convertISBN10to13(book.isbn))
            .filter((isbn) => isbn && isbn.length === 13);

        logger.info("API: ISBN変換完了", {
            listType,
            validIsbnCount: isbn13List.length,
            invalidCount: books.length - isbn13List.length,
        });

        // Get existing bibliographic info from database
        const existingInfo = getBibliographicInfoBatch(getDatabase(), isbn13List);
        const existingIsbnSet = new Set(existingInfo.map((info) => info.isbn));

        const cacheHitCount = existingInfo.length;
        const cacheMissCount = isbn13List.length - existingInfo.length;
        const cacheHitRate =
            isbn13List.length > 0
                ? ((cacheHitCount / isbn13List.length) * 100).toFixed(1)
                : "0.0";

        logger.info("API: 書誌情報DBキャッシュ確認完了", {
            listType,
            total: isbn13List.length,
            cacheHit: cacheHitCount,
            cacheMiss: cacheMissCount,
            hitRate: `${cacheHitRate}%`,
        });

        // Fetch missing bibliographic info from NDL
        const missingIsbns = isbn13List.filter(
            (isbn) => !existingIsbnSet.has(isbn),
        );
        const newlyFetchedInfo: BibliographicInfo[] = [];

        if (missingIsbns.length > 0) {
            logger.info("API: NDLから不足している書誌情報を取得開始", {
                listType,
                fetchCount: missingIsbns.length,
            });

            for (const isbn of missingIsbns) {
                try {
                    // NDLsearch now handles caching internally
                    const detail = await NDLsearch(
                        isbn,
                        getDatabase(),
                        getBibliographicInfo,
                        upsertBibliographicInfo,
                    );
                    if (detail && detail[0]) {
                        const item = detail[0];
                        if (item.isbn13 && item.title) {
                            const bibInfo: BibliographicInfo = {
                                isbn: item.isbn13,
                                title: item.title,
                                title_kana: item.titleKana,
                                authors: item.creators,
                                authors_kana: item.creatorsKana,
                                publisher: item.publisher,
                                pub_year: item.pubYear,
                                ndc10: item.ndc10,
                                ndlc: item.ndlc,
                            };
                            newlyFetchedInfo.push(bibInfo);
                            logger.debug("API: NDL書誌情報取得完了", {
                                isbn,
                                title: item.title,
                            });
                        }
                    }
                } catch (error) {
                    logger.error("API: NDL書誌情報取得失敗", {
                        isbn,
                        error: String(error),
                    });
                }
            }

            logger.info("API: NDL書誌情報取得処理完了", {
                listType,
                fetchedCount: newlyFetchedInfo.length,
                failedCount: missingIsbns.length - newlyFetchedInfo.length,
            });
        }

        // Combine all bibliographic info
        const allBibInfo = [...existingInfo, ...newlyFetchedInfo];

        logger.info("API: 書誌情報JSONダウンロード準備完了", {
            listType,
            totalRecords: allBibInfo.length,
            fromCache: existingInfo.length,
            fromNDL: newlyFetchedInfo.length,
        });

        // Format for JSON response
        const jsonData = {
            metadata: {
                listType,
                generatedAt: new Date().toISOString(),
                totalRecords: allBibInfo.length,
            },
            books: allBibInfo.map((info) => ({
                isbn: info.isbn,
                title: info.title,
                authors: info.authors,
                publisher: info.publisher || "",
                pub_year: info.pub_year || "",
                classification: {
                    ndc10: info.ndc10 || "",
                    ndlc: info.ndlc || "",
                },
            })),
        };

        // Return JSON with download headers (formatted for human readability)
        const filename = `bibliographic-${listType}-${new Date().toISOString().split("T")[0]}.json`;
        const formattedJson = JSON.stringify(jsonData, null, 2);

        return new Response(formattedJson, {
            status: 200,
            headers: {
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "public, max-age=2592000", // 30 days cache
                "Content-Type": "application/json; charset=utf-8",
            },
        });
    } catch (error) {
        logger.error("API: 書誌情報JSONダウンロード生成失敗", {
            listType,
            error: String(error),
        });
        return c.json({ error: "Failed to generate bibliographic data" }, 500);
    }
});

// APIエンドポイント: 書誌情報検索
bibliographicRoutes.get("/search/bibliographic", async (c) => {
    const query = c.req.query("q");
    const title = c.req.query("title");
    const author = c.req.query("author");
    const publisher = c.req.query("publisher");
    const isbn = c.req.query("isbn");
    const ndc10 = c.req.query("ndc10");
    const ndlc = c.req.query("ndlc");
    const yearFrom = c.req.query("yearFrom");
    const yearTo = c.req.query("yearTo");
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");

    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    logger.info("API: Bibliographic search request", {
        query,
        title,
        author,
        publisher,
        isbn,
        ndc10,
        ndlc,
        yearFrom,
        yearTo,
        limit,
        offset,
    });

    try {
        const searchOptions: SearchOptions = {
            query,
            title,
            author,
            publisher,
            isbn,
            ndc10,
            ndlc,
            yearFrom,
            yearTo,
            limit,
            offset,
        };

        const results = searchBibliographic(getDatabase(), searchOptions);
        const totalCount = countSearchResults(getDatabase(), searchOptions);

        logger.info("API: Search completed", {
            resultsCount: results.length,
            totalCount,
        });

        return c.json({
            results,
            pagination: {
                limit,
                offset,
                totalCount,
                hasMore: offset + results.length < totalCount,
            },
        });
    } catch (error) {
        logger.error("API: Search failed", {
            error: String(error),
        });
        return c.json({ error: "Search failed" }, 500);
    }
});

// APIエンドポイント: 分類・出版社の一覧取得
bibliographicRoutes.get("/search/filters", async (c) => {
    logger.info("API: Fetching search filters");

    try {
        const ndc10Classifications = getAllNDC10Classifications(getDatabase());
        const ndlcClassifications = getAllNDLCClassifications(getDatabase());
        const publishers = getAllPublishers(getDatabase());

        return c.json({
            ndc10: ndc10Classifications,
            ndlc: ndlcClassifications,
            publishers: publishers,
        });
    } catch (error) {
        logger.error("API: Failed to fetch search filters", {
            error: String(error),
        });
        return c.json({ error: "Failed to fetch filters" }, 500);
    }
});
