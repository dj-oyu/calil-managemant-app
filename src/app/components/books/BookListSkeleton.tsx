import type { FC } from "hono/jsx";
import { BookCardSkeleton } from "./BookCardSkeleton";

/**
 * Skeleton list component (count-based)
 */
export const BookListSkeleton: FC<{ count: number }> = ({ count }) => (
    <ul>
        {Array.from({ length: count }, (_, i) => (
            <BookCardSkeleton key={i} />
        ))}
    </ul>
);
