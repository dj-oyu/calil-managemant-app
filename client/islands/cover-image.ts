import { Island } from "./base";
import { logger } from "../shared/logger";

/**
 * CoverImageIsland - Lazy loading cover image component
 *
 * Features:
 * - IntersectionObserver: Loads images only when visible
 * - Concurrency control: Limits simultaneous requests
 * - Progressive loading: Shows placeholder → loading → image
 * - Error handling: Graceful fallback on failure
 *
 * @remarks
 * This class uses static members for shared state across all instances:
 * - Single IntersectionObserver for all cover images
 * - Shared queue and concurrency control
 * - Global cache of loaded ISBNs
 *
 * @example
 * HTML structure:
 * ```html
 * <div class="cover-placeholder" data-island="cover-image" data-isbn="9784123456789">
 *   <span class="cover-loading">📚</span>
 * </div>
 * ```
 */
export class CoverImageIsland extends Island {
    /** ISBN-13 of the book cover to load */
    private isbn: string;

    /** Set of ISBNs that have already been loaded (shared across all instances) */
    private static loadedCovers = new Set<string>();

    /** Set of ISBNs that returned 404 (no cover available) - persisted to localStorage */
    private static notFoundCovers = new Set<string>();

    /** localStorage key for 404 cache */
    private static readonly NOT_FOUND_CACHE_KEY = "cover-404-cache";

    /** Global IntersectionObserver instance (shared across all instances) */
    private static observer: IntersectionObserver | null = null;

    /** Queue of islands waiting to load their cover images */
    private static loadQueue: CoverImageIsland[] = [];

    /** Number of currently active HTTP requests */
    private static activeRequests = 0;

    /** Maximum number of concurrent HTTP requests allowed */
    private static maxConcurrent = 2;

    /** CSS class applied during image loading */
    private static readonly LOADING_CLASS = "loading";

    /** CSS class applied when image is successfully loaded */
    private static readonly LOADED_CLASS = "loaded";

    /** CSS class applied when image loading fails */
    private static readonly ERROR_CLASS = "error";

    /**
     * Create a new CoverImageIsland
     *
     * @param root - The root DOM element with data-isbn attribute
     * @throws {Error} If data-isbn attribute is missing
     */
    constructor(root: HTMLElement) {
        super(root);

        this.isbn = root.dataset.isbn || "";

        if (!this.isbn) {
            throw new Error("CoverImageIsland requires data-isbn attribute");
        }
    }

    /**
     * Load 404 cache from localStorage (synchronous)
     * @static
     * @private
     */
    private static loadNotFoundCache(): void {
        try {
            const cached = localStorage.getItem(this.NOT_FOUND_CACHE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                this.notFoundCovers = new Set(data);
            }
        } catch (error) {
            logger.warn("📷 Failed to load 404 cache from localStorage", error);
            // Ensure notFoundCovers is initialized even on error
            this.notFoundCovers = new Set();
        }
    }

    /**
     * Save 404 cache to localStorage
     * @static
     * @private
     */
    private static saveNotFoundCache(): void {
        try {
            const data = Array.from(this.notFoundCovers);
            localStorage.setItem(
                this.NOT_FOUND_CACHE_KEY,
                JSON.stringify(data),
            );
        } catch (error) {
            logger.warn("Failed to save 404 cache to localStorage", error);
        }
    }

    /**
     * Initialize the global IntersectionObserver
     *
     * @param maxConcurrent - Maximum number of concurrent image loads (default: 2)
     * @static
     * @remarks
     * Must be called before hydrating any CoverImageIsland instances.
     * Should only be called once during application initialization.
     */
    static initializeObserver(maxConcurrent?: number): void {
        // Load 404 cache from localStorage FIRST (before observer check)
        // This ensures cache is always up-to-date on tab switches
        this.loadNotFoundCache();

        if (this.observer) {
            return;
        }

        if (maxConcurrent) {
            this.maxConcurrent = maxConcurrent;
        }

        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const element = entry.target as HTMLElement;
                        const island = (element as any)
                            .__island as CoverImageIsland;

                        if (island) {
                            const inLoadedCache = this.loadedCovers.has(
                                island.isbn,
                            );
                            const in404Cache = this.notFoundCovers.has(
                                island.isbn,
                            );

                            if (!inLoadedCache && !in404Cache) {
                                this.enqueueLoad(island);
                            }
                        }
                    }
                });
            },
            {
                rootMargin: "50px",
                threshold: 0.01,
            },
        );
    }

    /**
     * Hydrate the island by registering with the IntersectionObserver
     *
     * @returns Promise that resolves when hydration is complete
     * @remarks
     * The actual image loading is deferred until the element enters the viewport
     */
    async hydrate(): Promise<void> {
        if (this.checkHydrated()) return;

        CoverImageIsland.loadNotFoundCache();
        // Check if this ISBN is in 404 cache before observing
        if (CoverImageIsland.notFoundCovers.has(this.isbn)) {
            // ISBN is known to not have a cover, apply error class immediately
            this.root.classList.add(CoverImageIsland.ERROR_CLASS);
            this.markHydrated();
            return;
        }

        // Store reference to this island instance
        (this.root as any).__island = this;

        // Start observing this element
        if (CoverImageIsland.observer) {
            CoverImageIsland.observer.observe(this.root);
        }

        this.markHydrated();
    }

    /**
     * Add an island to the load queue
     *
     * @param island - The island instance to enqueue
     * @static
     * @private
     */
    private static enqueueLoad(island: CoverImageIsland): void {
        this.loadQueue.push(island);
        this.processQueue();
    }

    /**
     * Process the load queue with concurrency control
     * Loads images while respecting the maxConcurrent limit
     *
     * @static
     * @private
     */
    private static processQueue(): void {
        while (
            this.loadQueue.length > 0 &&
            this.activeRequests < this.maxConcurrent
        ) {
            const island = this.loadQueue.shift();
            if (island) {
                island.loadCover();
            }
        }
    }

    /**
     * Load the cover image from the API
     * Fetches the image, creates an img element, and handles success/error
     *
     * @private
     * @returns Promise that resolves when loading is complete (success or error)
     */
    private async loadCover(): Promise<void> {
        if (
            CoverImageIsland.loadedCovers.has(this.isbn) ||
            CoverImageIsland.notFoundCovers.has(this.isbn)
        ) {
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

                const img = document.createElement("img");
                img.src = imageUrl;
                img.alt = `Cover for ISBN ${this.isbn}`;

                img.onload = () => {
                    this.root.classList.remove(CoverImageIsland.LOADING_CLASS);
                    this.root.classList.add(CoverImageIsland.LOADED_CLASS);
                    this.root.appendChild(img);
                };

                img.onerror = () => {
                    this.handleError(false);
                    URL.revokeObjectURL(imageUrl);
                };
            } else if (response.status === 404) {
                // 404: Cover doesn't exist - add to persistent cache
                this.handleError(true);
            } else {
                // Other errors: Don't cache, might be temporary
                this.handleError(false);
            }
        } catch (error) {
            logger.error(
                `📷 Failed to load cover for ISBN ${this.isbn}`,
                error,
            );
            this.handleError(false);
        } finally {
            CoverImageIsland.activeRequests--;
            CoverImageIsland.processQueue();
        }
    }

    /**
     * Handle image loading error
     * Applies error CSS class and removes loading class
     *
     * @param is404 - Whether this is a 404 error (should be cached permanently)
     * @private
     */
    private handleError(is404: boolean = false): void {
        this.root.classList.remove(CoverImageIsland.LOADING_CLASS);
        this.root.classList.add(CoverImageIsland.ERROR_CLASS);

        if (is404) {
            // Add to 404 cache to prevent future retries
            CoverImageIsland.notFoundCovers.add(this.isbn);
            CoverImageIsland.saveNotFoundCache();
        }
    }

    /**
     * Cleanup when island is destroyed
     * Stops observing this element
     *
     * @override
     */
    override destroy(): void {
        if (CoverImageIsland.observer) {
            CoverImageIsland.observer.unobserve(this.root);
        }
        super.destroy();
    }

    /**
     * Get current loading statistics
     *
     * @static
     * @returns Object containing queue length, active requests, and loaded count
     * @example
     * ```typescript
     * const stats = CoverImageIsland.getStats();
     * console.log(`Queue: ${stats.queue}, Active: ${stats.active}, Loaded: ${stats.loaded}`);
     * ```
     */
    static getStats() {
        return {
            /** Number of images waiting to be loaded */
            queue: this.loadQueue.length,
            /** Number of images currently being loaded */
            active: this.activeRequests,
            /** Total number of unique images that have been loaded */
            loaded: this.loadedCovers.size,
        };
    }
}
