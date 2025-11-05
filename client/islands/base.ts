/**
 * Base Island class for all interactive components
 *
 * Island Architecture principle:
 * - Each island is an independent interactive component
 * - Islands are hydrated only when needed
 * - Minimal JavaScript is loaded per island
 */
export abstract class Island {
    protected root: HTMLElement;
    protected isHydrated = false;

    constructor(root: HTMLElement) {
        this.root = root;
    }

    /**
     * Hydrate the island - make it interactive
     * This method should be implemented by each island
     */
    abstract hydrate(): void | Promise<void>;

    /**
     * Cleanup when island is destroyed
     */
    destroy(): void {
        this.isHydrated = false;
    }

    /**
     * Check if island is already hydrated
     */
    protected checkHydrated(): boolean {
        if (this.isHydrated) {
            console.warn('Island already hydrated', this.root);
            return true;
        }
        return false;
    }

    /**
     * Mark island as hydrated
     */
    protected markHydrated(): void {
        this.isHydrated = true;
        this.root.dataset.islandHydrated = 'true';
    }
}
