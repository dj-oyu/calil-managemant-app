import { logger } from '../shared/logger';

/**
 * Base Island class for all interactive components
 *
 * Island Architecture principle:
 * - Each island is an independent interactive component
 * - Islands are hydrated only when needed
 * - Minimal JavaScript is loaded per island
 *
 * @abstract
 * @example
 * ```typescript
 * class MyIsland extends Island {
 *   async hydrate() {
 *     if (this.checkHydrated()) return;
 *     // Add event listeners, fetch data, etc.
 *     this.markHydrated();
 *   }
 * }
 * ```
 */
export abstract class Island {
    /** The root DOM element of this island */
    protected root: HTMLElement;

    /** Whether this island has been hydrated */
    protected isHydrated = false;

    /**
     * Create a new Island instance
     * @param root - The root DOM element for this island
     */
    constructor(root: HTMLElement) {
        this.root = root;
    }

    /**
     * Hydrate the island - make it interactive
     * This method should be implemented by each island
     *
     * @abstract
     * @returns void or Promise<void> for async hydration
     * @example
     * ```typescript
     * async hydrate() {
     *   if (this.checkHydrated()) return;
     *   this.root.addEventListener('click', this.handleClick);
     *   this.markHydrated();
     * }
     * ```
     */
    abstract hydrate(): void | Promise<void>;

    /**
     * Cleanup when island is destroyed
     * Removes event listeners and resets hydration state
     *
     * @remarks
     * Override this method to add custom cleanup logic,
     * but always call super.destroy() at the end
     */
    destroy(): void {
        this.isHydrated = false;
    }

    /**
     * Check if island is already hydrated
     *
     * @returns true if already hydrated, false otherwise
     * @protected
     * @remarks
     * Call this at the beginning of hydrate() to prevent double hydration
     */
    protected checkHydrated(): boolean {
        if (this.isHydrated) {
            logger.warn('Island already hydrated', this.root);
            return true;
        }
        return false;
    }

    /**
     * Mark island as hydrated
     * Sets internal flag and adds data attribute to DOM element
     *
     * @protected
     * @remarks
     * Call this at the end of successful hydration
     */
    protected markHydrated(): void {
        this.isHydrated = true;
        this.root.dataset.islandHydrated = 'true';
    }
}
