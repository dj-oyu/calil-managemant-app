import { Island } from './base';
import { logger } from '../shared/logger';

/**
 * TabNavigationIsland - Client-side tab navigation
 *
 * Features:
 * - SPA-like experience: No page reload on tab switch
 * - History API: Browser back/forward works correctly
 * - Progressive enhancement: Falls back to links if JS fails
 * - Accessibility: Maintains proper ARIA attributes
 *
 * @example
 * HTML structure:
 * ```html
 * <nav class="tab-nav" data-island="tab-navigation">
 *   <a href="/?tab=wish" class="tab-button active">📖 読みたい本</a>
 *   <a href="/?tab=read" class="tab-button">✅ 読んだ本</a>
 * </nav>
 * <div class="tab-content active">...</div>
 * <div class="tab-content">...</div>
 * ```
 */
export class TabNavigationIsland extends Island {
    /** All tab button elements */
    private tabs: NodeListOf<HTMLAnchorElement>;

    /** All tab content elements */
    private tabContents: NodeListOf<HTMLElement>;

    /**
     * Create a new TabNavigationIsland
     *
     * @param root - The nav element containing tab buttons
     * @throws {Error} If no .tab-button elements are found
     */
    constructor(root: HTMLElement) {
        super(root);

        this.tabs = root.querySelectorAll<HTMLAnchorElement>('.tab-button');
        this.tabContents = document.querySelectorAll<HTMLElement>('.tab-content');

        if (this.tabs.length === 0) {
            throw new Error('TabNavigationIsland requires .tab-button elements');
        }
    }

    /**
     * Hydrate the island by attaching event listeners
     * Intercepts tab clicks and handles browser navigation
     *
     * @returns Promise that resolves when hydration is complete
     */
    async hydrate(): Promise<void> {
        if (this.checkHydrated()) return;

        logger.debug('🔖 [Hydrate] Starting TabNavigationIsland hydration');
        logger.debug('🔖 [Hydrate] Found', this.tabs.length, 'tab buttons');
        logger.debug('🔖 [Hydrate] Found', this.tabContents.length, 'tab contents');

        // Log tab content details
        this.tabContents.forEach((content, index) => {
            logger.debug(`🔖 [Hydrate] Tab content ${index}:`, {
                listType: content.dataset.listType,
                loaded: content.dataset.loaded,
                active: content.classList.contains('active')
            });
        });

        // Add click listeners to tabs
        this.tabs.forEach((tab) => {
            tab.addEventListener('click', this.handleTabClick);
        });

        // Handle browser back/forward
        window.addEventListener('popstate', this.handlePopState);

        this.markHydrated();
        logger.info('🔖 TabNavigationIsland hydrated');
    }

    /**
     * Handle tab button click
     * Prevents default navigation, updates URL with History API, and switches tabs
     *
     * @param e - Mouse click event
     * @private
     */
    private handleTabClick = (e: MouseEvent): void => {
        e.preventDefault();

        const tab = e.currentTarget as HTMLAnchorElement;
        const url = new URL(tab.href);
        const targetTab = url.searchParams.get('tab') || 'wish';

        // Update URL without reload
        history.pushState({ tab: targetTab }, '', url.toString());

        // Switch tabs
        this.switchToTab(targetTab as 'wish' | 'read');
    };

    /**
     * Handle browser back/forward navigation
     * Switches to the appropriate tab based on history state
     *
     * @param e - PopState event from browser navigation
     * @private
     */
    private handlePopState = (e: PopStateEvent): void => {
        const targetTab = e.state?.tab || 'wish';
        this.switchToTab(targetTab);
    };

    /**
     * Switch to the specified tab
     * Updates CSS classes and ARIA attributes for both tabs and content
     * Loads tab content dynamically if not yet loaded
     *
     * @param targetTab - The tab to switch to ('wish' or 'read')
     * @private
     * @remarks
     * Uses data-list-type attribute to match content with tabs,
     * avoiding index-based assumptions
     */
    private async switchToTab(targetTab: 'wish' | 'read'): Promise<void> {
        logger.info('🔖 Switching to tab:', targetTab);

        // Update tab buttons
        this.tabs.forEach((tab) => {
            const tabUrl = new URL(tab.href);
            const tabName = tabUrl.searchParams.get('tab') || 'wish';

            if (tabName === targetTab) {
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
            } else {
                tab.classList.remove('active');
                tab.setAttribute('aria-selected', 'false');
            }
        });

        // Update tab contents and load if necessary
        this.tabContents.forEach((content) => {
            const listType = content.dataset.listType;
            const isActive = listType === targetTab;

            logger.debug(`🔖 Tab content [${listType}]: active=${isActive}, loaded=${content.dataset.loaded}`);

            if (isActive) {
                content.classList.add('active');
                content.setAttribute('aria-hidden', 'false');

                // Load content if not yet loaded
                const loaded = content.dataset.loaded === 'true';
                if (!loaded) {
                    logger.info(`🔖 Loading content for: ${listType}`);
                    // Note: Not awaiting here to allow UI to update immediately
                    // Content will load in background
                    this.loadTabContent(content).catch(err => {
                        logger.error('Failed to load tab content', err);
                    });
                }
            } else {
                content.classList.remove('active');
                content.setAttribute('aria-hidden', 'true');
            }
        });
    }

    /**
     * Generate Skeleton UI HTML
     *
     * @param count - Number of skeleton cards to generate
     * @private
     * @returns HTML string for skeleton cards
     */
    private generateSkeletonHTML(count: number): string {
        const skeletonCard = `
            <li class="book-card skeleton">
                <div class="book-content">
                    <div class="book-info">
                        <div class="skeleton-title skeleton-shimmer"></div>
                        <div class="meta">
                            <div class="skeleton-text skeleton-shimmer"></div>
                            <div class="skeleton-text skeleton-shimmer"></div>
                            <div class="skeleton-text skeleton-shimmer"></div>
                            <div class="skeleton-text skeleton-shimmer"></div>
                        </div>
                    </div>
                    <div class="book-cover">
                        <div class="skeleton-cover skeleton-shimmer"></div>
                    </div>
                </div>
            </li>
        `;

        return `<ul>${skeletonCard.repeat(count)}</ul>`;
    }

    /**
     * Load tab content dynamically from the API
     *
     * @param contentElement - The tab content element to populate
     * @private
     */
    private async loadTabContent(contentElement: HTMLElement): Promise<void> {
        const listType = contentElement.dataset.listType;

        logger.debug('📥 loadTabContent called for:', listType);

        if (!listType || (listType !== 'wish' && listType !== 'read')) {
            logger.error('Invalid list type:', listType);
            return;
        }

        // Show Skeleton UI as loading state
        logger.debug('⏳ Showing Skeleton UI for:', listType);
        const skeletonCount = listType === 'wish' ? 5 : 2;
        contentElement.innerHTML = this.generateSkeletonHTML(skeletonCount);

        try {
            logger.debug(`🌐 Fetching /api/book-list/${listType}`);
            const response = await fetch(`/api/book-list/${listType}`);

            logger.debug(`📊 Response status: ${response.status}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            logger.debug(`✅ Received HTML (${html.length} chars)`);

            contentElement.innerHTML = html;
            contentElement.dataset.loaded = 'true';

            logger.debug('🏝️ Dispatching island:reload event');
            // Re-hydrate any islands in the newly loaded content
            const event = new CustomEvent('island:reload', { detail: { container: contentElement } });
            document.dispatchEvent(event);

            logger.info('✅ Tab content loaded successfully for:', listType);
        } catch (error) {
            logger.error('Failed to load tab content', error, { listType });

            // Show error with retry option
            const errorMessage = error instanceof Error ? error.message : String(error);
            contentElement.innerHTML = `
                <div style="padding: 2rem; text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 1rem; color: #cc0000;">⚠️</div>
                    <div style="color: #24292f; font-weight: 600; margin-bottom: 0.5rem;">読み込みに失敗しました</div>
                    <div style="font-size: 0.875rem; color: #57606a; margin-bottom: 1rem;">${errorMessage}</div>
                    <button
                        onclick="location.reload()"
                        style="
                            padding: 0.5rem 1rem;
                            background: #0969da;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 0.875rem;
                            font-weight: 600;
                        "
                    >
                        🔄 再読み込み
                    </button>
                </div>
            `;
        }
    }

    /**
     * Cleanup event listeners when island is destroyed
     * Removes both tab click listeners and popstate listener
     *
     * @override
     */
    override destroy(): void {
        this.tabs.forEach((tab) => {
            tab.removeEventListener('click', this.handleTabClick);
        });

        window.removeEventListener('popstate', this.handlePopState);

        super.destroy();
    }
}
