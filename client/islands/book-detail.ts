import { Island } from './base';

/**
 * BookDetailIsland - Interactive accordion for book details
 *
 * Features:
 * - Lazy loading: Fetches book details only when accordion is opened
 * - Caching: Loads data only once per ISBN
 * - Progressive enhancement: Works with native <details> element
 */
export class BookDetailIsland extends Island {
    private details: HTMLDetailsElement;
    private isbn: string;
    private summary: HTMLElement | null;
    private contentDiv: HTMLElement | null;
    private loaded = false;
    private originalText: string;

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

    async hydrate(): Promise<void> {
        if (this.checkHydrated()) return;

        // Add toggle listener
        this.details.addEventListener('toggle', this.handleToggle);

        this.markHydrated();
        console.log('📖 BookDetailIsland hydrated:', this.isbn);
    }

    private handleToggle = async () => {
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
            console.error('Failed to fetch book details:', error);
        }
    }

    override destroy(): void {
        this.details.removeEventListener('toggle', this.handleToggle);
        super.destroy();
    }
}
