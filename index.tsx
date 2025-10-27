import { Hono } from 'hono';
import { Suspense, use, useEffect, useState, type FC } from 'hono/jsx';
import { serve } from '@hono/node-server';
import { authRoutes } from './routes/auth';
import { fetchBookList } from './calil-fetch';
import { convertISBN10to13, NDLsearch, type NdlItem } from './utility';

const app = new Hono();

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

const BookDetailComponent = async ({ isbn }: { isbn: string }) => {
    const detail = await NDLsearch(isbn);
    if (!detail || detail[0] == null) {
        return <div>詳細情報が見つかりませんでした。</div>;
    }
    const item = detail[0];
    return (
        <dl>
            <dt>タイトル</dt>
            <dd>{item!.title}</dd>

            <dt>著者</dt>
            <dd>{item!.creators.join(', ')}</dd>

            <dt>出版社</dt>
            <dd>{item!.publisher}</dd>

            <dt>刊行年</dt>
            <dd>{item!.pubYear || '―'}</dd>

            <dt>NDC10</dt>
            <dd>{item!.ndc10 || '―'}</dd>
        </dl>
    );
}

const NDLSearchComponent: FC<{ isbn: string }> = ({ isbn }: { isbn: string }) => {
    const [open, setOpen] = useState(false);
    const toggleOpen = (e: UIEvent) => {
        e.preventDefault();
        console.log('toggled');
        setOpen((prev) => !prev);
    };

    return (
        <details class="ndl" open={open}>
            <summary onClick={toggleOpen}>{open ? '閉じる' : '詳細'}</summary>
            <Suspense fallback={<div>読み込み中...</div>}>
                <BookDetailComponent isbn={isbn} />
            </Suspense>
        </details>
    );
}

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
                details.ndl dl { margin: 0.5rem 0 0; color: #24292f; }
                details.ndl dt { font-weight: 600; margin-top: 0.5rem; }
                details.ndl dt:first-of-type { margin-top: 0; }
                details.ndl dd { margin: 0.1rem 0 0.4rem 0; }
            `}</style>
        </head>
        <body>
            <main>
                <h1>読みたい本リスト</h1>
                <ul>
                    {books.map((book) => {
                        const isbn13 = convertISBN10to13(book.isbn);
                        return (
                            <li>
                                <div class="title">{book.title}</div>
                                <div class="meta">
                                    <span>著者: {book.author || '不明'}</span>
                                    <span>出版社: {book.publisher || '不明'}</span>
                                    <span>刊行日: {book.pubdate || '不明'}</span>
                                    <span class="isbn">ISBN: {isbn13 || '―'}</span>
                                </div>
                                {isbn13 && (
                                    <NDLSearchComponent isbn={isbn13} />
                                )}
                            </li>
                        );
                    })}
                </ul>
            </main>
        </body>
    </html>
);

// 例: リスト取得（Cookieは内部で自動維持）
app.get('/', async (c) => {
    const res = await fetchBookList();

    const books = (typeof res === 'string' ? JSON.parse(res) : res) as Book[];
    return c.html(<BookListPage books={books} />);
});

serve({ fetch: app.fetch, port: 8787 });
console.log('listening http://localhost:8787');
