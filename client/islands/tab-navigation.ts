import { Island } from './base';

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

        console.log('🔖 [Hydrate] Starting TabNavigationIsland hydration');
        console.log('🔖 [Hydrate] Found', this.tabs.length, 'tab buttons');
        console.log('🔖 [Hydrate] Found', this.tabContents.length, 'tab contents');

        // Log tab content details
        this.tabContents.forEach((content, index) => {
            console.log(`🔖 [Hydrate] Tab content ${index}:`, {
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
        console.log('🔖 [Hydrate] TabNavigationIsland hydrated successfully');
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
        console.log('🔖 Switching to tab:', targetTab);

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

            console.log(`🔖 Tab content [${listType}]: active=${isActive}, loaded=${content.dataset.loaded}`);

            if (isActive) {
                content.classList.add('active');
                content.setAttribute('aria-hidden', 'false');

                // Load content if not yet loaded
                const loaded = content.dataset.loaded === 'true';
                if (!loaded) {
                    console.log(`🔖 Loading content for: ${listType}`);
                    // Note: Not awaiting here to allow UI to update immediately
                    // Content will load in background
                    this.loadTabContent(content).catch(err => {
                        console.error('Failed to load tab content:', err);
                    });
                }
            } else {
                content.classList.remove('active');
                content.setAttribute('aria-hidden', 'true');
            }
        });
    }

    /**
     * Load tab content dynamically from the API
     *
     * @param contentElement - The tab content element to populate
     * @private
     */
    private async loadTabContent(contentElement: HTMLElement): Promise<void> {
        const listType = contentElement.dataset.listType;

        console.log('📥 loadTabContent called for:', listType);

        if (!listType || (listType !== 'wish' && listType !== 'read')) {
            console.error('❌ Invalid list type:', listType);
            return;
        }

        // Show loading state
        console.log('⏳ Showing loading state for:', listType);
        contentElement.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #666;">
                <div style="font-size: 2rem; margin-bottom: 1rem;">${listType === 'wish' ? '📚' : '✅'}</div>
                <div>${listType === 'wish' ? '読みたい本を読み込み中...' : '読んだ本を読み込み中...'}</div>
            </div>
        `;

        try {
            console.log(`🌐 Fetching /api/book-list/${listType}`);
            const response = await fetch(`/api/book-list/${listType}`);

            console.log(`📊 Response status: ${response.status}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            console.log(`✅ Received HTML (${html.length} chars)`);

            contentElement.innerHTML = html;
            contentElement.dataset.loaded = 'true';

            console.log('🏝️ Dispatching island:reload event');
            // Re-hydrate any islands in the newly loaded content
            const event = new CustomEvent('island:reload', { detail: { container: contentElement } });
            document.dispatchEvent(event);

            console.log('✅ Tab content loaded successfully for:', listType);
        } catch (error) {
            console.error('❌ Failed to load tab content:', error);
            contentElement.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: #cc0000;">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                    <div>読み込みに失敗しました。</div>
                    <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #999;">${error instanceof Error ? error.message : String(error)}</div>
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
