import { Hono } from "hono";
import { type FC } from "hono/jsx";
import { renderToReadableStream, Suspense } from "hono/jsx/streaming";
import { raw } from "hono/html";
import { serve } from "@hono/node-server";
import { authRoutes } from "./routes/auth.routes";
import {
    fetchBookList,
    fetchBookListMetadata,
    fetchBookListPage,
} from "../features/calil/api/fetch-list";
import {
    convertISBN10to13,
    NDLsearch,
    type NdlItem,
} from "../features/ndl/utility";
import { logger } from "../shared/logging/logger";
import { initCoverCache, getCoverImage } from "../features/covers/server/cache";
import {
    embeddedCss,
    loadEmbeddedClientJs,
    getEmbeddedClientJs,
} from "./embedded-assets";

export const app = new Hono();

// 環境設定
const NODE_ENV = process.env.NODE_ENV || "development";
const isDevelopment = NODE_ENV === "development";

logger.info("Application starting", {
    environment: NODE_ENV,
    isDevelopment,
    cacheEnabled: !isDevelopment,
});

/**
 * 環境に応じたキャッシュヘッダーを生成
 *
 * @param contentType - Content-Type header value
 * @param maxAge - Cache max-age in seconds (production only)
 * @returns Cache headers object
 *
 * @remarks
 * - Development: キャッシュ無効化（即座に変更が反映される）
 * - Production: 長期キャッシュ（パフォーマンス最適化）
 */
function getCacheHeaders(
    contentType: string,
    maxAge: number = 31536000,
): Record<string, string> {
    if (isDevelopment) {
        // 開発環境: キャッシュ無効化
        return {
            "Content-Type": contentType,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
        };
    } else {
        // 本番環境: 長期キャッシュ
        return {
            "Content-Type": contentType,
            "Cache-Control": `public, max-age=${maxAge}, immutable`,
            "X-Content-Type-Options": "nosniff",
        };
    }
}

// Initialize cover cache on startup
await initCoverCache();

// Load embedded client JavaScript for compiled binaries
await loadEmbeddedClientJs();

// Define module directory URL for path resolution (from PR #2)
// Detect if running as a compiled binary
// In development mode, always treat as non-compiled even if Bun.main differs (due to index.tsx wrapper)
const isCompiledBinary = !isDevelopment && Bun.main !== import.meta.path;

const moduleDir = (() => {
    if (isCompiledBinary) {
        // When compiled, use the executable directory
        const exePath = Bun.main;
        // Handle both Unix and Windows paths
        const separator = exePath.includes("\\") ? "\\" : "/";
        const lastSepIndex = exePath.lastIndexOf(separator);
        const exeDir = exePath.substring(0, lastSepIndex + 1);
        // Ensure proper file:// URL format
        const normalizedPath = exeDir.replace(/\\/g, "/");
        return new URL(
            normalizedPath.startsWith("file://")
                ? normalizedPath
                : `file://${normalizedPath}`,
        );
    } else {
        // In development, use the module directory
        return new URL(".", import.meta.url);
    }
})();

logger.info("Path resolution initialized", {
    isCompiledBinary,
    moduleDir: moduleDir.href,
    bunMain: Bun.main,
    importMetaPath: import.meta.path,
});

// Faviconを配信
app.get("/favicon.ico", async (c) => {
    const faviconUrl = new URL("./favicon.ico", moduleDir);
    const file = Bun.file(faviconUrl);

    if (!(await file.exists())) {
        logger.debug("Favicon not found", { faviconUrl: faviconUrl.href });
        return c.notFound();
    }

    const arrayBuffer = await file.arrayBuffer();
    return new Response(arrayBuffer, {
        status: 200,
        headers: {
            "Content-Type": "image/x-icon",
            "Cache-Control": "public, max-age=86400", // 24 hours
        },
    });
});

// CSSファイルを配信
app.get("/public/styles/:filename{.+\\.css$}", async (c) => {
    const filename = c.req.param("filename");

    // Skip embedded CSS in development mode
    if (!isDevelopment) {
        // Try embedded CSS first (for compiled binaries)
        const embeddedContent = embeddedCss[filename];
        if (embeddedContent) {
            logger.debug("Serving embedded CSS", { filename });
            const headers = getCacheHeaders("text/css; charset=utf-8", 86400); // 24時間
            return c.text(embeddedContent, 200, headers);
        }
    }

    // Fall back to file system (for development or if file not embedded)
    const cssUrl = new URL(`./styles/${filename}`, moduleDir);
    const file = Bun.file(cssUrl);
    if (!(await file.exists())) {
        logger.warn("CSS file not found", {
            cssUrl: cssUrl.href,
            filename,
        });
        return c.text("Not Found", 404);
    }

    const content = await file.text();
    const headers = getCacheHeaders("text/css; charset=utf-8", 86400); // 24時間
    return c.text(content, 200, headers);
});

// TypeScriptファイルを動的にトランスパイルして配信
app.get("/public/:path{.+\\.js$}", async (c) => {
    const path = c.req.param("path");

    // Skip embedded JavaScript in development mode
    if (!isDevelopment) {
        // Try embedded JavaScript first (for compiled binaries)
        const embeddedJs = getEmbeddedClientJs(path);
        if (embeddedJs) {
            logger.debug("Serving embedded JavaScript", { path });
            const headers = getCacheHeaders(
                "application/javascript; charset=utf-8",
            );
            return c.text(embeddedJs, 200, headers);
        }
    }

    // Fall back to dynamic transpilation (for development)
    // .js を .ts に変換
    const tsPath = path.replace(/\.js$/, ".ts");

    // clientディレクトリ全体を検索（scripts/, islands/など）
    // In compiled binary, client directory is relative to executable
    // In development, it's ../../client relative to src/app
    const tsUrl = new URL(
        isCompiledBinary ? `./client/${tsPath}` : `../../client/${tsPath}`,
        moduleDir,
    );

    logger.debug("Transpiling request", {
        path,
        tsUrl: tsUrl.href,
        isCompiledBinary,
    });

    // ファイルの存在確認
    const file = Bun.file(tsUrl);
    if (!(await file.exists())) {
        logger.warn("TypeScript file not found", {
            tsUrl: tsUrl.href,
            isCompiledBinary,
            moduleDir: moduleDir.href,
        });
        return c.text("Not Found", 404);
    }

    try {
        // Use Bun.build for both dev and production (required for module resolution)
        // Development: No minification, no splitting
        // Production: Full optimizations
        const transpiled = await Bun.build({
            entrypoints: [tsUrl.pathname],
            target: "browser",
            minify: isDevelopment
                ? false
                : {
                      whitespace: true,
                      identifiers: true,
                      syntax: true,
                  },
            splitting: !isDevelopment, // Only split in production
            sourcemap: isDevelopment ? "inline" : "none",
        });

        if (!transpiled.success || !transpiled.outputs[0]) {
            logger.error("Transpilation failed", {
                path,
                tsUrl: tsUrl.href,
                success: transpiled.success,
                logs: transpiled.logs,
            });
            return c.text("Transpilation Error", 500);
        }

        const jsCode = await transpiled.outputs[0].text();

        logger.info("Transpiled successfully", {
            path,
            size: jsCode.length,
            isDevelopment,
        });

        const headers = getCacheHeaders(
            "application/javascript; charset=utf-8",
        );
        return c.text(jsCode, 200, headers);
    } catch (error) {
        logger.error("Error transpiling TypeScript", {
            path,
            tsUrl: tsUrl.href,
            error: String(error),
        });
        return c.text("Internal Server Error", 500);
    }
});

app.route("/auth", authRoutes);

// カバー画像取得エンドポイント（キャッシュ付き）
app.get("/api/cover/:isbn", async (c) => {
    const isbn = c.req.param("isbn");

    const result = await getCoverImage(isbn);

    if (!result) {
        return c.notFound();
    }

    // Bunのファイルを直接返す
    const file = Bun.file(result.path);
    const arrayBuffer = await file.arrayBuffer();

    return new Response(arrayBuffer, {
        status: 200,
        headers: {
            "Content-Type": result.contentType,
            "Cache-Control": "public, max-age=2592000", // 30 days
            "Content-Length": String(arrayBuffer.byteLength),
        },
    });
});

type Book = {
    id: string;
    title: string;
    author: string;
    pubdate: string;
    publisher: string;
    source: string;
    isbn: string;
    volume: string;
    updated: string;
};

const renderBookDetail = (item: NdlItem) => {
    return (
        <div class="book-detail">
            {/* 主要情報 */}
            <section class="detail-section detail-primary">
                {item.title && (
                    <div class="detail-row">
                        <span class="detail-label">タイトル</span>
                        <span class="detail-value">{item.title}</span>
                    </div>
                )}
                {item.titleKana && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">ヨミ</span>
                        <span class="detail-value detail-kana">
                            {item.titleKana}
                        </span>
                    </div>
                )}
                {item.creators.length > 0 && (
                    <div class="detail-row">
                        <span class="detail-label">著者</span>
                        <span class="detail-value">
                            {item.creators.join(", ")}
                        </span>
                    </div>
                )}
                {item.creatorsKana.length > 0 && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">著者ヨミ</span>
                        <span class="detail-value detail-kana">
                            {item.creatorsKana.join(", ")}
                        </span>
                    </div>
                )}
            </section>

            {/* 出版情報 */}
            <section class="detail-section">
                <h4 class="section-title">出版情報</h4>
                {item.publisher && (
                    <div class="detail-row">
                        <span class="detail-label">出版社</span>
                        <span class="detail-value">{item.publisher}</span>
                    </div>
                )}
                {item.pubYear && (
                    <div class="detail-row">
                        <span class="detail-label">刊行年</span>
                        <span class="detail-value">{item.pubYear}</span>
                    </div>
                )}
                {item.issued && (
                    <div class="detail-row">
                        <span class="detail-label">発行日</span>
                        <span class="detail-value">{item.issued}</span>
                    </div>
                )}
                {item.extent && (
                    <div class="detail-row">
                        <span class="detail-label">ページ数</span>
                        <span class="detail-value">{item.extent}</span>
                    </div>
                )}
                {item.price && (
                    <div class="detail-row">
                        <span class="detail-label">価格</span>
                        <span class="detail-value detail-price">
                            {item.price}
                        </span>
                    </div>
                )}
            </section>

            {/* 分類・識別情報 */}
            <section class="detail-section">
                <h4 class="section-title">分類・識別情報</h4>
                {item.isbn13 && (
                    <div class="detail-row">
                        <span class="detail-label">ISBN</span>
                        <span class="detail-value detail-code">
                            {item.isbn13}
                        </span>
                    </div>
                )}
                {item.ndc10 && (
                    <div class="detail-row">
                        <span class="detail-label">NDC10</span>
                        <span class="detail-value">{item.ndc10}</span>
                    </div>
                )}
                {item.ndlc && (
                    <div class="detail-row">
                        <span class="detail-label">NDLC</span>
                        <span class="detail-value">{item.ndlc}</span>
                    </div>
                )}
                {item.subjects.length > 0 && (
                    <div class="detail-row">
                        <span class="detail-label">件名</span>
                        <span class="detail-value">
                            {item.subjects.join(" / ")}
                        </span>
                    </div>
                )}
                {item.ndlBibId && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">NDL書誌ID</span>
                        <span class="detail-value detail-code">
                            {item.ndlBibId}
                        </span>
                    </div>
                )}
                {item.jpno && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">全国書誌番号</span>
                        <span class="detail-value detail-code">
                            {item.jpno}
                        </span>
                    </div>
                )}
            </section>

            {/* リンク */}
            {item.link && (
                <section class="detail-section">
                    <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="ndl-link"
                    >
                        📚 国立国会図書館で見る
                    </a>
                </section>
            )}
        </div>
    );
};

// Skeletonカードコンポーネント（ローディング表示用）
const BookCardSkeleton: FC = () => (
    <li class="book-card skeleton">
        <div class="book-content">
            <div class="book-info">
                <div class="skeleton-title skeleton-shimmer"></div>
                <div class="meta">
                    <div class="skeleton-text skeleton-shimmer"></div>
                    <div class="skeleton-text skeleton-shimmer"></div>
                    <div class="skeleton-text skeleton-shimmer"></div>
                    <div class="skeleton-text skeleton-shimmer"></div>
                </div>
            </div>
            <div class="book-cover">
                <div class="skeleton-cover skeleton-shimmer"></div>
            </div>
        </div>
    </li>
);

const BookCard: FC<{ book: Book }> = ({ book }) => {
    const isbn13 = convertISBN10to13(book.isbn);
    return (
        <li class="book-card">
            <div class="book-content">
                <div class="book-info">
                    <div class="title">{book.title}</div>
                    <div class="meta">
                        <span>著者: {book.author || "不明"}</span>
                        <span>出版社: {book.publisher || "不明"}</span>
                        <span>刊行日: {book.pubdate || "不明"}</span>
                        <span class="isbn">ISBN: {isbn13 || "―"}</span>
                    </div>
                    {isbn13 && (
                        <details
                            class="ndl"
                            data-island="book-detail"
                            data-isbn={isbn13}
                        >
                            <summary>詳細情報を表示</summary>
                            <div class="ndl-content"></div>
                        </details>
                    )}
                </div>
                {isbn13 && (
                    <div class="book-cover">
                        <div
                            class="cover-placeholder"
                            data-island="cover-image"
                            data-isbn={isbn13}
                        >
                            <span class="cover-loading">📚</span>
                        </div>
                    </div>
                )}
            </div>
        </li>
    );
};

const BookList: FC<{ books: Book[] }> = ({ books }) => (
    <ul>
        {books.map((book) => (
            <BookCard key={book.isbn} book={book} />
        ))}
    </ul>
);

// Skeletonリストコンポーネント（カウントベース）
const BookListSkeleton: FC<{ count: number }> = ({ count }) => (
    <ul>
        {Array.from({ length: count }, (_, i) => (
            <BookCardSkeleton key={i} />
        ))}
    </ul>
);

// 非同期書籍リストコンポーネント（Suspense対応）
const AsyncBookList = async ({ listType }: { listType: "wish" | "read" }) => {
    const bookData = await fetchBookList(listType);
    const books = (
        typeof bookData === "string" ? JSON.parse(bookData) : bookData
    ) as Book[];

    logger.info(`Fetched ${listType} books`, { count: books.length });

    return <BookList books={books} />;
};

// タブカウントを取得する軽量な非同期コンポーネント
const AsyncTabCount = async ({ listType }: { listType: "wish" | "read" }) => {
    const metadata = await fetchBookListMetadata(listType);
    return <>{metadata.totalCount}</>;
};

// Suspense対応のストリーミングページコンポーネント（アクティブなタブのみ読み込み）
const StreamingBookListPage: FC<{ activeTab?: "wish" | "read" }> = ({
    activeTab = "wish",
}) => (
    <html lang="ja">
        <head>
            <meta charSet="utf-8" />
            <title>Book Lists</title>
            <meta
                name="viewport"
                content="width=device-width, initial-scale=1"
            />
            <meta name="app-environment" content={NODE_ENV} />
            <meta name="cover-max-concurrent" content="2" />
            <link rel="stylesheet" href="/public/styles/main.css" />
        </head>
        <body>
            <main>
                <h1>📚 マイブックリスト</h1>

                <nav class="tab-nav" data-island="tab-navigation">
                    <a
                        href="/?tab=wish"
                        class={`tab-button ${activeTab === "wish" ? "active" : ""}`}
                        aria-selected={activeTab === "wish" ? "true" : "false"}
                    >
                        📖 読みたい本
                        <span class="tab-count">
                            <Suspense fallback={<>...</>}>
                                <AsyncTabCount listType="wish" />
                            </Suspense>
                        </span>
                    </a>
                    <a
                        href="/?tab=read"
                        class={`tab-button ${activeTab === "read" ? "active" : ""}`}
                        aria-selected={activeTab === "read" ? "true" : "false"}
                    >
                        ✅ 読んだ本
                        <span class="tab-count">
                            <Suspense fallback={<>...</>}>
                                <AsyncTabCount listType="read" />
                            </Suspense>
                        </span>
                    </a>
                </nav>

                {/* アクティブなタブのみSuspenseでレンダリング、非アクティブなタブは遅延ロード */}
                <div
                    class={`tab-content ${activeTab === "wish" ? "active" : ""}`}
                    aria-hidden={activeTab !== "wish" ? "true" : "false"}
                    data-list-type="wish"
                    data-loaded={activeTab === "wish" ? "true" : "false"}
                >
                    {activeTab === "wish" ? (
                        <Suspense fallback={<BookListSkeleton count={5} />}>
                            <AsyncBookList listType="wish" />
                        </Suspense>
                    ) : (
                        <div style="padding: 2rem; text-align: center; color: #999;">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">
                                📚
                            </div>
                            <div>タブを切り替えて読み込みます...</div>
                        </div>
                    )}
                </div>

                <div
                    class={`tab-content ${activeTab === "read" ? "active" : ""}`}
                    aria-hidden={activeTab !== "read" ? "true" : "false"}
                    data-list-type="read"
                    data-loaded={activeTab === "read" ? "true" : "false"}
                >
                    {activeTab === "read" ? (
                        <Suspense fallback={<BookListSkeleton count={2} />}>
                            <AsyncBookList listType="read" />
                        </Suspense>
                    ) : (
                        <div style="padding: 2rem; text-align: center; color: #999;">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">
                                ✅
                            </div>
                            <div>タブを切り替えて読み込みます...</div>
                        </div>
                    )}
                </div>
            </main>
            <script type="module" src="/public/islands/loader.js"></script>
        </body>
    </html>
);

// APIエンドポイント: 書籍リスト取得（ページネーション対応ストリーミング版）
// Query params: maxPages (optional, default: all pages)
app.get("/api/book-list-stream/:listType", async (c) => {
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
        headers: getCacheHeaders("application/x-ndjson"),
    });
});

// APIエンドポイント: 単一ページ取得（無限スクロール用）
app.get("/api/book-list-page/:listType/:page", async (c) => {
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
app.get("/api/books/:isbn", async (c) => {
    const isbn = c.req.param("isbn");

    logger.info("NDL Search started", { isbn });

    const detail = await NDLsearch(isbn);

    if (!detail || detail[0] == null) {
        logger.warn("No NDL results found", { isbn });
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
    logger.info("Book details retrieved", summary);

    return c.html(renderBookDetail(item));
});

// ログビューアーエンドポイント
app.get("/log", (c) => {
    const limit = c.req.query("limit")
        ? parseInt(c.req.query("limit")!)
        : undefined;
    const logs = logger.getLogs(limit);

    return c.html(
        <html lang="ja">
            <head>
                <meta charSet="utf-8" />
                <title>Application Logs</title>
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <link rel="stylesheet" href="/public/styles/logs.css" />
            </head>
            <body>
                <header>
                    <h1>📋 Application Logs</h1>
                    <div class="controls">
                        <a href="/log">🔄 Refresh</a>
                        <a href="/log?limit=50">Last 50</a>
                        <a href="/log?limit=100">Last 100</a>
                        <button onclick="fetch('/log/clear', {method: 'POST'}).then(() => location.reload())">
                            🗑️ Clear Logs
                        </button>
                        <a href="/">← Back to List</a>
                    </div>
                </header>
                <main>
                    {logs.length === 0 ? (
                        <div class="empty">No logs yet</div>
                    ) : (
                        logs.map((entry) => {
                            const levelIcon = {
                                info: "ℹ️",
                                warn: "⚠️",
                                error: "❌",
                                debug: "🔍",
                            }[entry.level];

                            return (
                                <div class="log-entry">
                                    <div class="log-header">
                                        <span class="log-time">
                                            {entry.timestamp.toISOString()}
                                        </span>
                                        <span
                                            class={`log-level ${entry.level}`}
                                        >
                                            {levelIcon}{" "}
                                            {entry.level.toUpperCase()}
                                        </span>
                                    </div>
                                    <div class="log-message">
                                        {entry.message}
                                    </div>
                                    {entry.data !== undefined && (
                                        <div class="log-data">
                                            <pre>
                                                {typeof entry.data === "object"
                                                    ? JSON.stringify(
                                                          entry.data,
                                                          null,
                                                          2,
                                                      )
                                                    : String(entry.data)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </main>
            </body>
        </html>,
    );
});

// ログクリアエンドポイント
app.post("/log/clear", (c) => {
    logger.clear();
    return c.json({ success: true });
});

// リスト取得（Suspense + Streaming対応）
app.get("/", async (c) => {
    const tab = (c.req.query("tab") as "wish" | "read") || "wish";

    logger.info("Streaming page request", { tab });

    // renderToReadableStreamを使用してストリーミングレスポンスを生成
    const stream = renderToReadableStream(
        <StreamingBookListPage activeTab={tab} />,
    );

    return c.body(stream, {
        headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Transfer-Encoding": "chunked",
        },
    });
});

// Only start the server if this file is run directly (not imported for testing)
// Note: When imported from index.tsx, Bun.main will be the path to index.tsx
// When imported from test files, Bun.main will be the path to the test file
const isTestEnvironment =
    Bun.main.includes(".test.") || Bun.main.includes("/test/");

if (!isTestEnvironment) {
    serve({ fetch: app.fetch, port: 8787 });
    console.log("listening http://localhost:8787");
    console.log("logs available at http://localhost:8787/log");
}
