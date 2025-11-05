import { Island } from './base';
import { logger } from '../shared/logger';

/**
 * BookDetailIsland - Interactive accordion for book details
 *
 * Features:
 * - Lazy loading: Fetches book details only when accordion is opened
 * - Caching: Loads data only once per ISBN
 * - Progressive enhancement: Works with native <details> element
 *
 * @example
 * HTML structure:
 * ```html
 * <details class="ndl" data-island="book-detail" data-isbn="9784123456789">
 *   <summary>詳細情報を表示</summary>
 *   <div class="ndl-content"></div>
 * </details>
 * ```
 */
export class BookDetailIsland extends Island {
    /** The <details> element serving as the accordion */
    private details: HTMLDetailsElement;

    /** ISBN-13 of the book */
    private isbn: string;

    /** The <summary> element containing the toggle text */
    private summary: HTMLElement | null;

    /** The container div where book details will be rendered */
    private contentDiv: HTMLElement | null;

    /** Whether book details have been loaded from the API */
    private loaded = false;

    /** Original summary text before interaction */
    private originalText: string;

    /**
     * Create a new BookDetailIsland
     *
     * @param root - Must be a <details> element with data-isbn attribute
     * @throws {Error} If root is not a <details> element
     * @throws {Error} If data-isbn attribute is missing
     */
    constructor(root: HTMLElement) {
        super(root);

        if (!(root instanceof HTMLDetailsElement)) {
            throw new Error('BookDetailIsland root must be a <details> element');
        }

        this.details = root;
        this.isbn = root.dataset.isbn || '';
        this.summary = root.querySelector('summary');
        this.contentDiv = root.querySelector('.ndl-content');
        this.originalText = this.summary?.textContent || '詳細情報を表示';

        if (!this.isbn) {
            throw new Error('BookDetailIsland requires data-isbn attribute');
        }
    }

    /**
     * Hydrate the island by attaching event listeners
     *
     * @returns Promise that resolves when hydration is complete
     */
    async hydrate(): Promise<void> {
        if (this.checkHydrated()) return;

        // Add toggle listener
        this.details.addEventListener('toggle', this.handleToggle);

        this.markHydrated();
        logger.info('📖 BookDetailIsland hydrated:', this.isbn);
    }

    /**
     * Handle accordion toggle event
     * Updates summary text and fetches book details on first open
     *
     * @private
     */
    private handleToggle = async (): Promise<void> => {
        // Update summary text
        if (this.summary) {
            this.summary.textContent = this.details.open ? '閉じる' : this.originalText;
        }

        // Fetch book details if opening and not yet loaded
        if (this.details.open && !this.loaded && this.contentDiv) {
            this.loaded = true;
            await this.fetchBookDetails();
        }
    };

    /**
     * Fetch book details from the API
     * Shows loading state and handles errors gracefully
     *
     * @private
     * @returns Promise that resolves when fetch is complete
     */
    private async fetchBookDetails(): Promise<void> {
        if (!this.contentDiv) return;

        this.contentDiv.innerHTML = '<div>読み込み中...</div>';

        try {
            const response = await fetch(`/api/books/${this.isbn}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            this.contentDiv.innerHTML = html;
        } catch (error) {
            this.contentDiv.innerHTML = '<div>詳細情報の取得に失敗しました。</div>';
            logger.error('Failed to fetch book details', error, { isbn: this.isbn });
        }
    }

    /**
     * Cleanup event listeners when island is destroyed
     *
     * @override
     */
    override destroy(): void {
        this.details.removeEventListener('toggle', this.handleToggle);
        super.destroy();
    }
}
