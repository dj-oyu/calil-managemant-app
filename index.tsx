import { Hono } from 'hono';
import { use, useEffect, useState, type FC } from 'hono/jsx';
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

type BookDetail = {
    title: string;
    authors: string[];
    publisher: string;
    pubYear: string;
    ndc10: string | null;
};

const NDLSearchComponent: FC<{ isbn: string }> = ({ isbn }: { isbn: string }) => {
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<BookDetail | null>(null);

    useEffect(() => {
        if (open && !detail) {
            console.log(`Fetching NDL data for ISBN: ${isbn}`);
            (async () => {
                const response = await NDLsearch(isbn);
                if (response && response.length > 0) {
                    const item: NdlItem = response[0]!;
                    setDetail({
                        title: item.title || '',
                        authors: item.creators || [],
                        publisher: item.publisher || '',
                        pubYear: item.pubYear || '不明',
                        ndc10: item.ndc10 || null,
                    });
                }
            })();
        }
    }, [open]);

    const toggleOpen = (e: MouseEvent) => {
        e.preventDefault();
        setOpen((prev) => !prev);
    }

    if (open && !detail) {
        return <div>Loading...</div>;
    }

    return (
        <details className="ndl" open={open}>
            <summary onClick={toggleOpen}>詳細</summary>

            <dl>
                <dt>タイトル</dt>
                <dd>{detail?.title || '不明'}</dd>

                <dt>著者</dt>
                <dd>{detail?.authors.join(', ') || '不明'}</dd>

                <dt>出版社</dt>
                <dd>{detail?.publisher || '不明'}</dd>

                <dt>刊行年</dt>
                <dd>{detail?.pubYear || '不明'}</dd>

                <dt>NDC10</dt>
                <dd>{detail?.ndc10 || '―'}</dd>
            </dl>
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
                                <div className="title">{book.title}</div>
                                <div className="meta">
                                    <span>著者: {book.author || '不明'}</span>
                                    <span>出版社: {book.publisher || '不明'}</span>
                                    <span>刊行日: {book.pubdate || '不明'}</span>
                                    <span className="isbn">ISBN: {isbn13 || '―'}</span>
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
