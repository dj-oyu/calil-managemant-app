import { Island } from './base';
import { BookDetailIsland } from './book-detail';
import { CoverImageIsland } from './cover-image';
import { TabNavigationIsland } from './tab-navigation';

/**
 * Island type definitions
 */
type IslandType = 'book-detail' | 'cover-image' | 'tab-navigation';

type IslandConstructor = new (root: HTMLElement) => Island;

/**
 * Island registry - maps island types to their constructors
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
 */
export class IslandLoader {
    private islands: Island[] = [];
    private isInitialized = false;

    /**
     * Initialize and hydrate all islands on the page
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
     */
    private getMaxConcurrentFromMeta(): number {
        const metaTag = document.querySelector<HTMLMetaElement>('meta[name="cover-max-concurrent"]');
        return metaTag ? parseInt(metaTag.content) : 2;
    }

    /**
     * Get statistics about hydrated islands
     */
    getStats() {
        const stats: Record<string, number> = {};

        this.islands.forEach((island) => {
            const type = island.constructor.name;
            stats[type] = (stats[type] || 0) + 1;
        });

        return {
            total: this.islands.length,
            byType: stats,
            coverLoader: CoverImageIsland.getStats(),
        };
    }

    /**
     * Destroy all islands (cleanup)
     */
    destroy(): void {
        this.islands.forEach((island) => island.destroy());
        this.islands = [];
        this.isInitialized = false;
    }
}

/**
 * Auto-initialize on DOMContentLoaded
 */
if (typeof window !== 'undefined') {
    const loader = new IslandLoader();

    document.addEventListener('DOMContentLoaded', async () => {
        await loader.init();

        // Expose to window for debugging
        (window as any).islandLoader = loader;
    });
}
