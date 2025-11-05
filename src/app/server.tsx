import { Hono } from 'hono';
import { type FC } from 'hono/jsx';
import { renderToReadableStream, Suspense } from 'hono/jsx/streaming';
import { serve } from '@hono/node-server';
import { authRoutes } from './routes/auth.routes';
import { fetchBookList } from '../features/calil/api/fetch-list';
import { convertISBN10to13, NDLsearch, type NdlItem } from '../features/ndl/utility';
import { logger } from '../shared/logging/logger';
import { initCoverCache, getCoverImage } from '../features/covers/server/cache';

const app = new Hono();

// Initialize cover cache on startup
await initCoverCache();

// Define module directory URL for path resolution (from PR #2)
const moduleDir = new URL('.', import.meta.url);

// CSSファイルを配信
app.get('/public/styles/:filename{.+\\.css$}', async (c) => {
    const filename = c.req.param('filename');
    const cssUrl = new URL(`./styles/${filename}`, moduleDir);

    const file = Bun.file(cssUrl);
    if (!(await file.exists())) {
        logger.warn('CSS file not found', { cssUrl: cssUrl.href });
        return c.text('Not Found', 404);
    }

    const content = await file.text();
    return c.text(content, 200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
    });
});

// TypeScriptファイルを動的にトランスパイルして配信
app.get('/public/:path{.+\\.js$}', async (c) => {
    const path = c.req.param('path');
    // .js を .ts に変換
    const tsPath = path.replace(/\.js$/, '.ts');

    // clientディレクトリ全体を検索（scripts/, islands/など）
    const tsUrl = new URL(`../../client/${tsPath}`, moduleDir);

    logger.debug('Transpiling request', { path, tsUrl: tsUrl.href });

    // ファイルの存在確認
    const file = Bun.file(tsUrl);
    if (!(await file.exists())) {
        logger.warn('TypeScript file not found', { tsUrl: tsUrl.href });
        return c.text('Not Found', 404);
    }

    try {
        const transpiled = await Bun.build({
            entrypoints: [tsUrl.pathname],
            target: 'browser',
            minify: false,
        });

        if (transpiled.success && transpiled.outputs[0]) {
            const jsCode = await transpiled.outputs[0].text();
            logger.info('Transpiled successfully', {
                path,
                tsPath: tsUrl.pathname,
                size: jsCode.length,
                outputCount: transpiled.outputs.length
            });
            return c.text(jsCode, 200, {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'public, max-age=3600',
            });
        }

        logger.error('Transpilation failed', {
            path,
            tsUrl: tsUrl.href,
            success: transpiled.success,
            logs: transpiled.logs
        });
        return c.text('Transpilation Error', 500);
    } catch (error) {
        logger.error('Error transpiling TypeScript', {
            path,
            tsUrl: tsUrl.href,
            error: String(error)
        });
        return c.text('Internal Server Error', 500);
    }
});

app.route('/auth', authRoutes);

// カバー画像取得エンドポイント（キャッシュ付き）
app.get('/api/cover/:isbn', async (c) => {
    const isbn = c.req.param('isbn');

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
            'Content-Type': result.contentType,
            'Cache-Control': 'public, max-age=2592000', // 30 days
            'Content-Length': String(arrayBuffer.byteLength),
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
                        <span class="detail-value detail-kana">{item.titleKana}</span>
                    </div>
                )}
                {item.creators.length > 0 && (
                    <div class="detail-row">
                        <span class="detail-label">著者</span>
                        <span class="detail-value">{item.creators.join(', ')}</span>
                    </div>
                )}
                {item.creatorsKana.length > 0 && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">著者ヨミ</span>
                        <span class="detail-value detail-kana">{item.creatorsKana.join(', ')}</span>
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
                        <span class="detail-value detail-price">{item.price}</span>
                    </div>
                )}
            </section>

            {/* 分類・識別情報 */}
            <section class="detail-section">
                <h4 class="section-title">分類・識別情報</h4>
                {item.isbn13 && (
                    <div class="detail-row">
                        <span class="detail-label">ISBN</span>
                        <span class="detail-value detail-code">{item.isbn13}</span>
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
                        <span class="detail-value">{item.subjects.join(' / ')}</span>
                    </div>
                )}
                {item.ndlBibId && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">NDL書誌ID</span>
                        <span class="detail-value detail-code">{item.ndlBibId}</span>
                    </div>
                )}
                {item.jpno && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">全国書誌番号</span>
                        <span class="detail-value detail-code">{item.jpno}</span>
                    </div>
                )}
            </section>

            {/* リンク */}
            {item.link && (
                <section class="detail-section">
                    <a href={item.link} target="_blank" rel="noopener noreferrer" class="ndl-link">
                        📚 国立国会図書館で見る
                    </a>
                </section>
            )}
        </div>
    );
};

const BookCard: FC<{ book: Book }> = ({ book }) => {
    const isbn13 = convertISBN10to13(book.isbn);
    return (
        <li class="book-card">
            <div class="book-content">
                <div class="book-info">
                    <div class="title">{book.title}</div>
                    <div class="meta">
                        <span>著者: {book.author || '不明'}</span>
                        <span>出版社: {book.publisher || '不明'}</span>
                        <span>刊行日: {book.pubdate || '不明'}</span>
                        <span class="isbn">ISBN: {isbn13 || '―'}</span>
                    </div>
                    {isbn13 && (
                        <details class="ndl" data-island="book-detail" data-isbn={isbn13}>
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

// 非同期書籍リストコンポーネント（Suspense対応）
const AsyncBookList = async ({ listType }: { listType: 'wish' | 'read' }) => {
    const bookData = await fetchBookList(listType);
    const books = (typeof bookData === 'string' ? JSON.parse(bookData) : bookData) as Book[];

    logger.info(`Fetched ${listType} books`, { count: books.length });

    return <BookList books={books} />;
};

// タブカウントを取得する軽量な非同期コンポーネント
const AsyncTabCount = async ({ listType }: { listType: 'wish' | 'read' }) => {
    const bookData = await fetchBookList(listType);
    const books = (typeof bookData === 'string' ? JSON.parse(bookData) : bookData) as Book[];
    return <>{books.length}</>;
};

// Suspense対応のストリーミングページコンポーネント（アクティブなタブのみ読み込み）
const StreamingBookListPage: FC<{ activeTab?: 'wish' | 'read' }> = ({ activeTab = 'wish' }) => (
    <html lang="ja">
        <head>
            <meta charSet="utf-8" />
            <title>Book Lists</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <meta name="cover-max-concurrent" content="2" />
            <link rel="stylesheet" href="/public/styles/main.css" />
        </head>
        <body>
            <main>
                <h1>📚 マイブックリスト</h1>

                <nav class="tab-nav" data-island="tab-navigation">
                    <a href="/?tab=wish" class={`tab-button ${activeTab === 'wish' ? 'active' : ''}`} aria-selected={activeTab === 'wish' ? 'true' : 'false'}>
                        📖 読みたい本
                        <span class="tab-count">
                            <Suspense fallback={<>...</>}>
                                <AsyncTabCount listType="wish" />
                            </Suspense>
                        </span>
                    </a>
                    <a href="/?tab=read" class={`tab-button ${activeTab === 'read' ? 'active' : ''}`} aria-selected={activeTab === 'read' ? 'true' : 'false'}>
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
                    class={`tab-content ${activeTab === 'wish' ? 'active' : ''}`}
                    aria-hidden={activeTab !== 'wish' ? 'true' : 'false'}
                    data-list-type="wish"
                    data-loaded={activeTab === 'wish' ? 'true' : 'false'}
                >
                    {activeTab === 'wish' ? (
                        <Suspense fallback={
                            <div style="padding: 2rem; text-align: center; color: #666;">
                                <div style="font-size: 2rem; margin-bottom: 1rem;">📚</div>
                                <div>読みたい本を読み込み中...</div>
                            </div>
                        }>
                            <AsyncBookList listType="wish" />
                        </Suspense>
                    ) : (
                        <div style="padding: 2rem; text-align: center; color: #999;">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">📚</div>
                            <div>タブを切り替えて読み込みます...</div>
                        </div>
                    )}
                </div>

                <div
                    class={`tab-content ${activeTab === 'read' ? 'active' : ''}`}
                    aria-hidden={activeTab !== 'read' ? 'true' : 'false'}
                    data-list-type="read"
                    data-loaded={activeTab === 'read' ? 'true' : 'false'}
                >
                    {activeTab === 'read' ? (
                        <Suspense fallback={
                            <div style="padding: 2rem; text-align: center; color: #666;">
                                <div style="font-size: 2rem; margin-bottom: 1rem;">✅</div>
                                <div>読んだ本を読み込み中...</div>
                            </div>
                        }>
                            <AsyncBookList listType="read" />
                        </Suspense>
                    ) : (
                        <div style="padding: 2rem; text-align: center; color: #999;">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">✅</div>
                            <div>タブを切り替えて読み込みます...</div>
                        </div>
                    )}
                </div>
            </main>
            <script type="module" src="/public/islands/loader.js"></script>
        </body>
    </html>
);

// APIエンドポイント: 書籍リスト取得（タブ切り替え用）
app.get('/api/book-list/:listType', async (c) => {
    const listType = c.req.param('listType') as 'wish' | 'read';

    logger.info('API: book-list request received', { listType });

    if (listType !== 'wish' && listType !== 'read') {
        logger.warn('API: Invalid list type', { listType });
        return c.json({ error: 'Invalid list type' }, 400);
    }

    try {
        logger.info('API: Fetching book list', { listType });

        const bookData = await fetchBookList(listType);
        const books = (typeof bookData === 'string' ? JSON.parse(bookData) : bookData) as Book[];

        logger.info('API: Book list fetched successfully', { listType, count: books.length });

        // BookListコンポーネントをHTMLとして返す
        const htmlResponse = c.html(<BookList books={books} />);

        logger.info('API: Sending HTML response', { listType });

        return htmlResponse;
    } catch (error) {
        logger.error('API: Failed to fetch book list', { listType, error: String(error) });
        return c.html(
            <div style="padding: 2rem; text-align: center; color: #cc0000;">
                <div style="font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                <div>サーバーエラーが発生しました。</div>
            </div>,
            500
        );
    }
});

// APIエンドポイント: 書籍詳細取得（通常のHTMLレスポンス）
app.get('/api/books/:isbn', async (c) => {
    const isbn = c.req.param('isbn');

    logger.info('NDL Search started', { isbn });

    const detail = await NDLsearch(isbn);

    if (!detail || detail[0] == null) {
        logger.warn('No NDL results found', { isbn });
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
    logger.info('Book details retrieved', summary);

    return c.html(renderBookDetail(item));
});

// ログビューアーエンドポイント
app.get('/log', (c) => {
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
    const logs = logger.getLogs(limit);

    return c.html(
        <html lang="ja">
            <head>
                <meta charSet="utf-8" />
                <title>Application Logs</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="stylesheet" href="/public/styles/logs.css" />
            </head>
            <body>
                <header>
                    <h1>📋 Application Logs</h1>
                    <div class="controls">
                        <a href="/log">🔄 Refresh</a>
                        <a href="/log?limit=50">Last 50</a>
                        <a href="/log?limit=100">Last 100</a>
                        <button onclick="fetch('/log/clear', {method: 'POST'}).then(() => location.reload())">🗑️ Clear Logs</button>
                        <a href="/">← Back to List</a>
                    </div>
                </header>
                <main>
                    {logs.length === 0 ? (
                        <div class="empty">No logs yet</div>
                    ) : (
                        logs.map((entry) => {
                            const levelIcon = {
                                info: 'ℹ️',
                                warn: '⚠️',
                                error: '❌',
                                debug: '🔍',
                            }[entry.level];

                            return (
                                <div class="log-entry">
                                    <div class="log-header">
                                        <span class="log-time">{entry.timestamp.toISOString()}</span>
                                        <span class={`log-level ${entry.level}`}>{levelIcon} {entry.level.toUpperCase()}</span>
                                    </div>
                                    <div class="log-message">{entry.message}</div>
                                    {entry.data !== undefined && (
                                        <div class="log-data">
                                            <pre>{typeof entry.data === 'object' ? JSON.stringify(entry.data, null, 2) : String(entry.data)}</pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </main>
            </body>
        </html>
    );
});

// ログクリアエンドポイント
app.post('/log/clear', (c) => {
    logger.clear();
    return c.json({ success: true });
});

// リスト取得（Suspense + Streaming対応）
app.get('/', async (c) => {
    const tab = (c.req.query('tab') as 'wish' | 'read') || 'wish';

    logger.info('Streaming page request', { tab });

    // renderToReadableStreamを使用してストリーミングレスポンスを生成
    const stream = renderToReadableStream(<StreamingBookListPage activeTab={tab} />);

    return c.body(stream, {
        headers: {
            'Content-Type': 'text/html; charset=UTF-8',
            'Transfer-Encoding': 'chunked',
        },
    });
});

serve({ fetch: app.fetch, port: 8787 });
console.log('listening http://localhost:8787');
console.log('logs available at http://localhost:8787/log');
