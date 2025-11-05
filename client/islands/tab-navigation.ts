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

        // Add click listeners to tabs
        this.tabs.forEach((tab) => {
            tab.addEventListener('click', this.handleTabClick);
        });

        // Handle browser back/forward
        window.addEventListener('popstate', this.handlePopState);

        this.markHydrated();
        console.log('🔖 TabNavigationIsland hydrated');
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
     * Assumes first content element corresponds to 'wish' tab,
     * second content element corresponds to 'read' tab
     */
    private async switchToTab(targetTab: 'wish' | 'read'): Promise<void> {
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
        for (let index = 0; index < this.tabContents.length; index++) {
            const content = this.tabContents[index];
            // Assuming first content is 'wish', second is 'read'
            const isActive = (index === 0 && targetTab === 'wish') || (index === 1 && targetTab === 'read');

            if (isActive) {
                content.classList.add('active');
                content.setAttribute('aria-hidden', 'false');

                // Load content if not yet loaded
                const loaded = content.dataset.loaded === 'true';
                if (!loaded) {
                    await this.loadTabContent(content);
                }
            } else {
                content.classList.remove('active');
                content.setAttribute('aria-hidden', 'true');
            }
        }
    }

    /**
     * Load tab content dynamically from the API
     *
     * @param contentElement - The tab content element to populate
     * @private
     */
    private async loadTabContent(contentElement: HTMLElement): Promise<void> {
        const listType = contentElement.dataset.listType;

        if (!listType || (listType !== 'wish' && listType !== 'read')) {
            console.error('Invalid list type:', listType);
            return;
        }

        // Show loading state
        contentElement.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #666;">
                <div style="font-size: 2rem; margin-bottom: 1rem;">${listType === 'wish' ? '📚' : '✅'}</div>
                <div>${listType === 'wish' ? '読みたい本を読み込み中...' : '読んだ本を読み込み中...'}</div>
            </div>
        `;

        try {
            const response = await fetch(`/api/book-list/${listType}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            contentElement.innerHTML = html;
            contentElement.dataset.loaded = 'true';

            // Re-hydrate any islands in the newly loaded content
            const event = new CustomEvent('island:reload', { detail: { container: contentElement } });
            document.dispatchEvent(event);
        } catch (error) {
            contentElement.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: #cc0000;">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                    <div>読み込みに失敗しました。</div>
                </div>
            `;
            console.error('Failed to load tab content:', error);
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
