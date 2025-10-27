import { Hono } from 'hono';
import { type FC } from 'hono/jsx';
import { serve } from '@hono/node-server';
import { authRoutes } from './routes/auth';
import { fetchBookList } from './calil-fetch';
import { convertISBN10to13, NDLsearch, type NdlItem } from './utility';
import { logger } from './logger';

const app = new Hono();

// TypeScriptファイルを動的にトランスパイルして配信
app.get('/public/:filename{.+\\.js$}', async (c) => {
    const filename = c.req.param('filename');
    // .js を .ts に変換
    const tsFilename = filename.replace(/\.js$/, '.ts');
    const tsPath = `./public/${tsFilename}`;

    // ファイルの存在確認
    const file = Bun.file(tsPath);
    if (!(await file.exists())) {
        return c.text('Not Found', 404);
    }

    try {
        const transpiled = await Bun.build({
            entrypoints: [tsPath],
            target: 'browser',
            minify: false,
        });

        if (transpiled.success && transpiled.outputs[0]) {
            const jsCode = await transpiled.outputs[0].text();
            return c.text(jsCode, 200, {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'public, max-age=3600',
            });
        }

        console.error('Transpilation failed:', transpiled.logs);
        return c.text('Transpilation Error', 500);
    } catch (error) {
        console.error('Error transpiling TypeScript:', error);
        return c.text('Internal Server Error', 500);
    }
});

app.route('/auth', authRoutes);

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

const BookListPage: FC<{ books: Book[] }> = ({ books }: { books: Book[] }) => (
    <html lang="ja">
        <head>
            <meta charSet="utf-8" />
            <title>Wish List</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>{`
                body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f5; color: #24292f; }
                main { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
                h1 { font-size: 1.75rem; margin-bottom: 1.5rem; }
                ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 1rem; }
                li { padding: 1rem 1.25rem; background: #fff; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
                .title { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.4rem; }
                .meta { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; font-size: 0.9rem; color: #57606a; }
                .meta span { display: inline-flex; align-items: center; gap: 0.3rem; }
                .isbn { font-family: "Fira Code", Menlo, Consolas, monospace; font-size: 0.85rem; }
                details.ndl { margin-top: 0.75rem; }
                details.ndl summary { cursor: pointer; color: #0969da; outline: none; }
                details.ndl summary:focus-visible { box-shadow: 0 0 0 3px rgba(9,105,218,0.25); border-radius: 6px; }
                details.ndl[open] summary { font-weight: 600; }
                .ndl-content { font-size: 0.9rem; padding: 0.5rem 0; }

                /* Book Detail Styles */
                .book-detail {
                    background: linear-gradient(to right, #f6f8fa 0%, transparent 100%);
                    border-radius: 8px;
                    padding: 1rem;
                }
                .detail-section { margin-bottom: 1.25rem; }
                .detail-section:last-child { margin-bottom: 0; }
                .detail-primary { background: #fff; padding: 0.75rem; border-radius: 6px; border: 1px solid #d0d7de; }
                .section-title {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: #0969da;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin: 0 0 0.5rem 0;
                    padding-bottom: 0.25rem;
                    border-bottom: 2px solid #0969da;
                }
                .detail-row {
                    display: grid;
                    grid-template-columns: 100px 1fr;
                    gap: 0.75rem;
                    padding: 0.4rem 0;
                    border-bottom: 1px solid #f0f0f0;
                }
                .detail-row:last-child { border-bottom: none; }
                .detail-row.detail-secondary { opacity: 0.8; font-size: 0.9rem; }
                .detail-label {
                    font-weight: 600;
                    color: #57606a;
                    font-size: 0.85rem;
                    align-self: start;
                    padding-top: 0.1rem;
                }
                .detail-value {
                    color: #24292f;
                    line-height: 1.5;
                    word-break: break-word;
                }
                .detail-kana { font-size: 0.9rem; color: #57606a; }
                .detail-code {
                    font-family: "Fira Code", Menlo, Consolas, monospace;
                    font-size: 0.85rem;
                    background: #f6f8fa;
                    padding: 0.2rem 0.4rem;
                    border-radius: 3px;
                }
                .detail-price { font-weight: 600; color: #1a7f37; }
                .ndl-link {
                    display: inline-block;
                    padding: 0.6rem 1rem;
                    background: linear-gradient(135deg, #0969da 0%, #0550ae 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 0.9rem;
                    transition: all 0.2s;
                    box-shadow: 0 2px 4px rgba(9,105,218,0.2);
                }
                .ndl-link:hover {
                    background: linear-gradient(135deg, #0550ae 0%, #033d8b 100%);
                    box-shadow: 0 4px 8px rgba(9,105,218,0.3);
                    transform: translateY(-1px);
                }
            `}</style>
        </head>
        <body>
            <main>
                <h1>読みたい本リスト</h1>
                <ul>
                    {books.map((book) => {
                        const isbn13 = convertISBN10to13(book.isbn);
                        return (
                            <li key={book.isbn}>
                                <div class="title">{book.title}</div>
                                <div class="meta">
                                    <span>著者: {book.author || '不明'}</span>
                                    <span>出版社: {book.publisher || '不明'}</span>
                                    <span>刊行日: {book.pubdate || '不明'}</span>
                                    <span class="isbn">ISBN: {isbn13 || '―'}</span>
                                </div>
                                {isbn13 && (
                                    <details class="ndl" data-isbn={isbn13}>
                                        <summary>詳細情報を表示</summary>
                                        <div class="ndl-content"></div>
                                    </details>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </main>
            <script type="module" src="/public/accordion.js"></script>
        </body>
    </html>
);

// APIエンドポイント: 書籍詳細取得
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
                <style>{`
                    body { margin: 0; font-family: "Fira Code", Menlo, Consolas, monospace; background: #0d1117; color: #c9d1d9; font-size: 13px; }
                    header { background: #161b22; border-bottom: 1px solid #30363d; padding: 1rem 1.5rem; position: sticky; top: 0; z-index: 10; }
                    h1 { margin: 0; font-size: 1.25rem; color: #58a6ff; }
                    .controls { margin-top: 0.75rem; display: flex; gap: 0.5rem; }
                    .controls button, .controls a { padding: 0.4rem 0.8rem; background: #21262d; border: 1px solid #30363d; color: #c9d1d9; text-decoration: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
                    .controls button:hover, .controls a:hover { background: #30363d; }
                    main { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
                    .log-entry { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; margin-bottom: 0.75rem; }
                    .log-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
                    .log-time { color: #8b949e; font-size: 0.85rem; }
                    .log-level { padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600; }
                    .log-level.info { background: #1f6feb; color: white; }
                    .log-level.warn { background: #d29922; color: white; }
                    .log-level.error { background: #da3633; color: white; }
                    .log-level.debug { background: #6e7681; color: white; }
                    .log-message { color: #c9d1d9; line-height: 1.6; }
                    .log-data { margin-top: 0.5rem; padding: 0.75rem; background: #0d1117; border-radius: 4px; border-left: 3px solid #30363d; overflow-x: auto; }
                    .log-data pre { margin: 0; color: #79c0ff; }
                    .empty { text-align: center; padding: 3rem; color: #8b949e; }
                `}</style>
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

// 例: リスト取得（Cookieは内部で自動維持）
app.get('/', async (c) => {
    const res = await fetchBookList();
    const books = (typeof res === 'string' ? JSON.parse(res) : res) as Book[];
    return c.html(<BookListPage books={books} />);
});

serve({ fetch: app.fetch, port: 8787 });
console.log('listening http://localhost:8787');
console.log('logs available at http://localhost:8787/log');
