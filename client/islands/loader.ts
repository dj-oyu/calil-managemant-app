import { Island } from './base';
import { BookDetailIsland } from './book-detail';
import { CoverImageIsland } from './cover-image';
import { TabNavigationIsland } from './tab-navigation';

/**
 * Valid island type identifiers that can be used in data-island attribute
 * @typedef {'book-detail' | 'cover-image' | 'tab-navigation'} IslandType
 */
type IslandType = 'book-detail' | 'cover-image' | 'tab-navigation';

/**
 * Constructor signature for Island classes
 * @typedef {new (root: HTMLElement) => Island} IslandConstructor
 */
type IslandConstructor = new (root: HTMLElement) => Island;

/**
 * Island registry - maps island types to their constructors
 *
 * @const
 * @type {Record<IslandType, IslandConstructor>}
 * @remarks
 * Add new island types here when creating new island components
 *
 * @example
 * ```typescript
 * const ISLAND_REGISTRY: Record<IslandType, IslandConstructor> = {
 *   'book-detail': BookDetailIsland,
 *   'cover-image': CoverImageIsland,
 *   'tab-navigation': TabNavigationIsland,
 *   'my-new-island': MyNewIsland, // Add new islands here
 * };
 * ```
 */
const ISLAND_REGISTRY: Record<IslandType, IslandConstructor> = {
    'book-detail': BookDetailIsland,
    'cover-image': CoverImageIsland,
    'tab-navigation': TabNavigationIsland,
};

/**
 * IslandLoader - Automatic hydration system
 *
 * Features:
 * - Automatic discovery: Finds islands via data-island attribute
 * - Lazy hydration: Can defer hydration based on strategy
 * - Error isolation: One island failure doesn't affect others
 * - Lifecycle management: Tracks and manages island instances
 *
 * @remarks
 * This is the main orchestrator for the island architecture pattern.
 * It automatically discovers and hydrates all islands on the page.
 *
 * @example
 * ```typescript
 * const loader = new IslandLoader();
 * await loader.init();
 *
 * // Get statistics
 * console.log(loader.getStats());
 *
 * // Cleanup when needed
 * loader.destroy();
 * ```
 */
export class IslandLoader {
    /** Array of all hydrated island instances */
    private islands: Island[] = [];

    /** Whether the loader has been initialized */
    private isInitialized = false;

    /**
     * Initialize and hydrate all islands on the page
     *
     * @returns Promise that resolves when all islands are hydrated
     * @remarks
     * This method:
     * 1. Initializes the CoverImageIsland observer
     * 2. Discovers all elements with [data-island] attribute
     * 3. Hydrates each island in parallel
     * 4. Uses Promise.allSettled to ensure all hydrations complete
     *
     * @example
     * ```typescript
     * const loader = new IslandLoader();
     * await loader.init();
     * ```
     */
    async init(): Promise<void> {
        if (this.isInitialized) {
            console.warn('IslandLoader already initialized');
            return;
        }

        console.log('🏝️ Island Architecture: Initializing...');

        // Initialize CoverImageIsland observer
        const maxConcurrent = this.getMaxConcurrentFromMeta();
        CoverImageIsland.initializeObserver(maxConcurrent);

        // Find and hydrate all islands
        const islandElements = document.querySelectorAll<HTMLElement>('[data-island]');

        console.log(`🏝️ Found ${islandElements.length} islands to hydrate`);

        const hydrationPromises = Array.from(islandElements).map((element) =>
            this.hydrateIsland(element)
        );

        await Promise.allSettled(hydrationPromises);

        this.isInitialized = true;

        console.log(`🏝️ Island Architecture: Hydrated ${this.islands.length} islands`);
        console.log('🏝️ Active islands:', this.getStats());
    }

    /**
     * Hydrate a single island
     *
     * @param element - The DOM element to hydrate as an island
     * @private
     * @returns Promise that resolves when hydration is complete
     * @remarks
     * This method:
     * 1. Validates the data-island attribute
     * 2. Looks up the island constructor from the registry
     * 3. Instantiates and hydrates the island
     * 4. Adds the island to the managed instances array
     *
     * Errors are caught and logged but don't stop other islands from hydrating
     */
    private async hydrateIsland(element: HTMLElement): Promise<void> {
        const islandType = element.dataset.island as IslandType;

        if (!islandType) {
            console.error('Island missing data-island attribute', element);
            return;
        }

        const IslandClass = ISLAND_REGISTRY[islandType];

        if (!IslandClass) {
            console.error(`Unknown island type: ${islandType}`, element);
            return;
        }

        try {
            const island = new IslandClass(element);
            await island.hydrate();
            this.islands.push(island);
        } catch (error) {
            console.error(`Failed to hydrate island: ${islandType}`, error, element);
        }
    }

    /**
     * Get max concurrent requests from meta tag
     *
     * @private
     * @returns Maximum concurrent requests (default: 2)
     * @remarks
     * Looks for <meta name="cover-max-concurrent" content="N"> in the document
     */
    private getMaxConcurrentFromMeta(): number {
        const metaTag = document.querySelector<HTMLMetaElement>('meta[name="cover-max-concurrent"]');
        return metaTag ? parseInt(metaTag.content) : 2;
    }

    /**
     * Reload islands within a specific container
     * Used when new content is dynamically loaded
     *
     * @param container - The container element containing new islands
     * @returns Promise that resolves when all islands are hydrated
     * @remarks
     * This method is called when new content is dynamically loaded into the page,
     * such as when switching tabs. It finds and hydrates all islands within the
     * specified container.
     */
    async reloadIslands(container: HTMLElement): Promise<void> {
        console.log('🏝️ Reloading islands in container:', container);

        const islandElements = container.querySelectorAll<HTMLElement>('[data-island]');

        console.log(`🏝️ Found ${islandElements.length} islands to hydrate in container`);

        const hydrationPromises = Array.from(islandElements).map((element) =>
            this.hydrateIsland(element)
        );

        await Promise.allSettled(hydrationPromises);

        console.log(`🏝️ Reloaded ${islandElements.length} islands`);
    }

    /**
     * Get statistics about hydrated islands
     *
     * @returns Object containing total count, counts by type, and cover loader stats
     * @example
     * ```typescript
     * const stats = loader.getStats();
     * console.log(`Total islands: ${stats.total}`);
     * console.log('By type:', stats.byType);
     * console.log('Cover loader:', stats.coverLoader);
     * ```
     */
    getStats() {
        const stats: Record<string, number> = {};

        this.islands.forEach((island) => {
            const type = island.constructor.name;
            stats[type] = (stats[type] || 0) + 1;
        });

        return {
            /** Total number of hydrated islands */
            total: this.islands.length,
            /** Count of islands by type */
            byType: stats,
            /** Cover image loader statistics */
            coverLoader: CoverImageIsland.getStats(),
        };
    }

    /**
     * Destroy all islands (cleanup)
     *
     * @remarks
     * Calls destroy() on each island instance, then clears the islands array
     * and resets initialization state. This allows re-initialization if needed.
     */
    destroy(): void {
        this.islands.forEach((island) => island.destroy());
        this.islands = [];
        this.isInitialized = false;
    }
}

/**
 * Auto-initialize on DOMContentLoaded
 *
 * @remarks
 * This code runs automatically when the module is loaded.
 * It creates an IslandLoader instance and initializes it when the DOM is ready.
 * The loader is exposed on window.islandLoader for debugging purposes.
 *
 * @example
 * In browser console:
 * ```javascript
 * // Check island statistics
 * window.islandLoader.getStats()
 *
 * // Manually destroy all islands
 * window.islandLoader.destroy()
 * ```
 */
if (typeof window !== 'undefined') {
    const loader = new IslandLoader();

    document.addEventListener('DOMContentLoaded', async () => {
        await loader.init();

        // Expose to window for debugging
        (window as any).islandLoader = loader;
    });

    // Listen for island reload events (e.g., from dynamic content loading)
    document.addEventListener('island:reload', async (event: Event) => {
        const customEvent = event as CustomEvent<{ container: HTMLElement }>;
        if (customEvent.detail?.container) {
            await loader.reloadIslands(customEvent.detail.container);
        }
    });
}
