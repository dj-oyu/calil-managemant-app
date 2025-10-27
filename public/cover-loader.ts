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
                    const element = entry.target as HTMLElement;
                    const isbn = element.dataset.isbn;
                    console.log(`👁️ Intersection: ISBN=${isbn}, isIntersecting=${entry.isIntersecting}, ratio=${entry.intersectionRatio}`);

                    if (entry.isIntersecting) {
                        if (!this.loadedCovers.has(isbn!)) {
                            console.log(`➕ Adding to queue: ISBN=${isbn}`);
                            this.queue.push(element);
                            this.processQueue();
                        } else {
                            console.log(`⏭️ Already loaded: ISBN=${isbn}`);
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
        console.log(`🔍 Found ${placeholders.length} cover placeholders`);
        placeholders.forEach((el, index) => {
            console.log(`  - Placeholder ${index}: ISBN=${el.dataset.isbn}`);
            this.observer.observe(el);
        });
        console.log(`📷 Cover loader initialized: ${placeholders.length} covers found`);
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
            console.log(`⏭️ Skip loading: ISBN=${isbn} (already loaded or no ISBN)`);
            return;
        }

        console.log(`📥 Loading cover: ISBN=${isbn}`);
        this.activeRequests++;
        element.classList.add(LOADING_CLASS);
        this.loadedCovers.add(isbn);

        try {
            const url = `/api/cover/${isbn}`;
            console.log(`🌐 Fetching: ${url}`);
            const response = await fetch(url);

            console.log(`📡 Response: status=${response.status}, ok=${response.ok}`);

            if (response.ok) {
                const blob = await response.blob();
                console.log(`📦 Blob received: size=${blob.size}, type=${blob.type}`);
                const imageUrl = URL.createObjectURL(blob);

                const img = document.createElement('img');
                img.src = imageUrl;
                img.alt = `Cover for ISBN ${isbn}`;
                img.onload = () => {
                    console.log(`✅ Image loaded successfully: ISBN=${isbn}`);
                    element.classList.remove(LOADING_CLASS);
                    element.classList.add(LOADED_CLASS);
                    element.appendChild(img);
                };
                img.onerror = () => {
                    console.error(`❌ Image load error: ISBN=${isbn}`);
                    this.handleError(element, isbn);
                    URL.revokeObjectURL(imageUrl);
                };
            } else {
                console.warn(`⚠️ HTTP error: ISBN=${isbn}, status=${response.status}`);
                this.handleError(element, isbn);
            }
        } catch (error) {
            console.error(`❌ Failed to load cover for ${isbn}:`, error);
            this.handleError(element, isbn);
        } finally {
            this.activeRequests--;
            console.log(`🔄 Active requests: ${this.activeRequests}`);
            this.processQueue(); // Process next item in queue
        }
    }

    private handleError(element: HTMLElement, isbn: string) {
        element.classList.remove(LOADING_CLASS);
        element.classList.add(ERROR_CLASS);
        console.debug(`Cover not available for ISBN: ${isbn}`);
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
    console.log('🚀 Cover loader script loaded');

    // Check for custom max concurrent setting
    const metaTag = document.querySelector<HTMLMetaElement>('meta[name="cover-max-concurrent"]');
    const maxConcurrent = metaTag ? parseInt(metaTag.content) : MAX_CONCURRENT_REQUESTS;

    console.log('⚙️ Max concurrent requests:', maxConcurrent);

    const loader = new CoverLoader(maxConcurrent);
    loader.observe();

    // Expose to window for debugging
    (window as any).coverLoader = loader;

    console.log('✅ Cover loader initialized');

    // Log stats periodically in dev mode
    if (window.location.hostname === 'localhost') {
        setInterval(() => {
            const stats = loader.getStats();
            if (stats.queue > 0 || stats.active > 0) {
                console.log('📊 Cover loader stats:', stats);
            }
        }, 2000);
    }
});

console.log('📦 Cover loader module loaded');
