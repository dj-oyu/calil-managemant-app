import type { FC } from "hono/jsx";
import { Suspense } from "hono/jsx/streaming";
import {
    fetchBookList,
    fetchBookListMetadata,
} from "../../../features/calil/api/fetch-list";
import type { Book } from "../../../features/calil/types/book";
import { BookList } from "../books/BookList";
import { BookListSkeleton } from "../books/BookListSkeleton";
import { NODE_ENV } from "../../utils/environment";

// 非同期書籍リストコンポーネント（Suspense対応）
const AsyncBookList = async ({ listType }: { listType: "wish" | "read" }) => {
    const bookData = await fetchBookList(listType);
    const books = (
        typeof bookData === "string" ? JSON.parse(bookData) : bookData
    ) as Book[];

    return <BookList books={books} />;
};

// タブカウントを取得する軽量な非同期コンポーネント
const AsyncTabCount = async ({ listType }: { listType: "wish" | "read" }) => {
    const metadata = await fetchBookListMetadata(listType);
    return <>{metadata.totalCount}</>;
};

/**
 * Suspense対応のストリーミングページコンポーネント（アクティブなタブのみ読み込み）
 */
export const StreamingBookListPage: FC<{ activeTab?: "wish" | "read" }> = ({
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

                <div class="download-section">
                    <a
                        href={`/api/download/bibliographic/${activeTab}`}
                        class="download-button"
                        download
                    >
                        📥 書誌情報をダウンロード
                    </a>
                </div>

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
                        <Suspense fallback={<BookListSkeleton count={5} />}>
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
