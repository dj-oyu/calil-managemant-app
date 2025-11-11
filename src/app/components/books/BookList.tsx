import type { FC } from "hono/jsx";
import type { Book } from "../../../features/calil/types/book";
import { BookCard } from "./BookCard";

export const BookList: FC<{ books: Book[] }> = ({ books }) => (
    <ul>
        {books.map((book) => (
            <BookCard key={book.isbn} book={book} />
        ))}
    </ul>
);
