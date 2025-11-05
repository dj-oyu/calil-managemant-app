import { Island } from './base';

/**
 * CoverImageIsland - Lazy loading cover image component
 *
 * Features:
 * - IntersectionObserver: Loads images only when visible
 * - Concurrency control: Limits simultaneous requests
 * - Progressive loading: Shows placeholder → loading → image
 * - Error handling: Graceful fallback on failure
 */
export class CoverImageIsland extends Island {
    private isbn: string;
    private static loadedCovers = new Set<string>();
    private static observer: IntersectionObserver | null = null;
    private static loadQueue: CoverImageIsland[] = [];
    private static activeRequests = 0;
    private static maxConcurrent = 2;

    private static readonly LOADING_CLASS = 'loading';
    private static readonly LOADED_CLASS = 'loaded';
    private static readonly ERROR_CLASS = 'error';

    constructor(root: HTMLElement) {
        super(root);

        this.isbn = root.dataset.isbn || '';

        if (!this.isbn) {
            throw new Error('CoverImageIsland requires data-isbn attribute');
        }
    }

    /**
     * Initialize the global IntersectionObserver
     */
    static initializeObserver(maxConcurrent?: number): void {
        if (maxConcurrent) {
            this.maxConcurrent = maxConcurrent;
        }

        if (this.observer) return;

        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const element = entry.target as HTMLElement;
                        const island = (element as any).__island as CoverImageIsland;

                        if (island && !this.loadedCovers.has(island.isbn)) {
                            this.enqueueLoad(island);
                        }
                    }
                });
            },
            {
                rootMargin: '50px',
                threshold: 0.01,
            }
        );
    }

    async hydrate(): Promise<void> {
        if (this.checkHydrated()) return;

        // Store reference to this island instance
        (this.root as any).__island = this;

        // Start observing this element
        if (CoverImageIsland.observer) {
            CoverImageIsland.observer.observe(this.root);
        }

        this.markHydrated();
        console.log('📷 CoverImageIsland hydrated:', this.isbn);
    }

    private static enqueueLoad(island: CoverImageIsland): void {
        this.loadQueue.push(island);
        this.processQueue();
    }

    private static processQueue(): void {
        while (this.loadQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
            const island = this.loadQueue.shift();
            if (island) {
                island.loadCover();
            }
        }
    }

    private async loadCover(): Promise<void> {
        if (CoverImageIsland.loadedCovers.has(this.isbn)) {
            return;
        }

        CoverImageIsland.activeRequests++;
        this.root.classList.add(CoverImageIsland.LOADING_CLASS);
        CoverImageIsland.loadedCovers.add(this.isbn);

        try {
            const response = await fetch(`/api/cover/${this.isbn}`);

            if (response.ok) {
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);

                const img = document.createElement('img');
                img.src = imageUrl;
                img.alt = `Cover for ISBN ${this.isbn}`;

                img.onload = () => {
                    this.root.classList.remove(CoverImageIsland.LOADING_CLASS);
                    this.root.classList.add(CoverImageIsland.LOADED_CLASS);
                    this.root.appendChild(img);
                };

                img.onerror = () => {
                    this.handleError();
                    URL.revokeObjectURL(imageUrl);
                };
            } else {
                this.handleError();
            }
        } catch (error) {
            console.error(`Failed to load cover ${this.isbn}:`, error);
            this.handleError();
        } finally {
            CoverImageIsland.activeRequests--;
            CoverImageIsland.processQueue();
        }
    }

    private handleError(): void {
        this.root.classList.remove(CoverImageIsland.LOADING_CLASS);
        this.root.classList.add(CoverImageIsland.ERROR_CLASS);
    }

    override destroy(): void {
        if (CoverImageIsland.observer) {
            CoverImageIsland.observer.unobserve(this.root);
        }
        super.destroy();
    }

    /**
     * Get current loading statistics
     */
    static getStats() {
        return {
            queue: this.loadQueue.length,
            active: this.activeRequests,
            loaded: this.loadedCovers.size,
        };
    }
}
