import type { FC } from "hono/jsx";

/**
 * Skeleton card component for loading state
 */
export const BookCardSkeleton: FC = () => (
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
