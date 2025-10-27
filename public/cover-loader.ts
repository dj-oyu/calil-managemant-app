// Lazy loading cover images with concurrency control

// Configuration
const MAX_CONCURRENT_REQUESTS = 2;
const LOADING_CLASS = 'loading';
const LOADED_CLASS = 'loaded';
const ERROR_CLASS = 'error';

// Queue and state management
class CoverLoader {
    private queue: HTMLElement[] = [];
    private activeRequests = 0;
    private observer: IntersectionObserver;
    private loadedCovers = new Set<string>();
    private _maxConcurrent: number;

    constructor(maxConcurrent = MAX_CONCURRENT_REQUESTS) {
        this._maxConcurrent = maxConcurrent;

        // IntersectionObserver to detect visible covers
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const element = entry.target as HTMLElement;
                        const isbn = element.dataset.isbn;
                        if (!this.loadedCovers.has(isbn!)) {
                            this.queue.push(element);
                            this.processQueue();
                        }
                    }
                });
            },
            {
                rootMargin: '50px', // Start loading 50px before entering viewport
                threshold: 0.01,
            }
        );
    }

    get maxConcurrent() {
        return this._maxConcurrent;
    }

    // Start observing all cover placeholders
    observe() {
        const placeholders = document.querySelectorAll<HTMLElement>('[data-lazy-cover]');
        placeholders.forEach((el) => this.observer.observe(el));
        console.log(`📷 Cover loader: ${placeholders.length} covers ready`);
    }

    // Process queue with concurrency control
    private processQueue() {
        while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
            const element = this.queue.shift();
            if (element) {
                this.loadCover(element);
            }
        }
    }

    // Load a single cover image
    private async loadCover(element: HTMLElement) {
        const isbn = element.dataset.isbn;
        if (!isbn || this.loadedCovers.has(isbn)) {
            return;
        }

        this.activeRequests++;
        element.classList.add(LOADING_CLASS);
        this.loadedCovers.add(isbn);

        try {
            const response = await fetch(`/api/cover/${isbn}`);

            if (response.ok) {
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);

                const img = document.createElement('img');
                img.src = imageUrl;
                img.alt = `Cover for ISBN ${isbn}`;
                img.onload = () => {
                    element.classList.remove(LOADING_CLASS);
                    element.classList.add(LOADED_CLASS);
                    element.appendChild(img);
                };
                img.onerror = () => {
                    this.handleError(element);
                    URL.revokeObjectURL(imageUrl);
                };
            } else {
                this.handleError(element);
            }
        } catch (error) {
            console.error(`Failed to load cover ${isbn}:`, error);
            this.handleError(element);
        } finally {
            this.activeRequests--;
            this.processQueue();
        }
    }

    private handleError(element: HTMLElement) {
        element.classList.remove(LOADING_CLASS);
        element.classList.add(ERROR_CLASS);
    }

    // Get current stats
    getStats() {
        return {
            queue: this.queue.length,
            active: this.activeRequests,
            loaded: this.loadedCovers.size,
        };
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Check for custom max concurrent setting
    const metaTag = document.querySelector<HTMLMetaElement>('meta[name="cover-max-concurrent"]');
    const maxConcurrent = metaTag ? parseInt(metaTag.content) : MAX_CONCURRENT_REQUESTS;

    const loader = new CoverLoader(maxConcurrent);
    loader.observe();

    // Expose to window for debugging
    (window as any).coverLoader = loader;
});
