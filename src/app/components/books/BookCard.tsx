import type { FC } from "hono/jsx";
import type { Book } from "../../../features/calil/types/book";
import { convertISBN10to13 } from "../../../features/ndl/utility";

export const BookCard: FC<{ book: Book }> = ({ book }) => {
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
