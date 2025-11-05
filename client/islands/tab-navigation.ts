import { Island } from './base';

/**
 * TabNavigationIsland - Client-side tab navigation
 *
 * Features:
 * - SPA-like experience: No page reload on tab switch
 * - History API: Browser back/forward works correctly
 * - Progressive enhancement: Falls back to links if JS fails
 * - Accessibility: Maintains proper ARIA attributes
 */
export class TabNavigationIsland extends Island {
    private tabs: NodeListOf<HTMLAnchorElement>;
    private tabContents: NodeListOf<HTMLElement>;

    constructor(root: HTMLElement) {
        super(root);

        this.tabs = root.querySelectorAll<HTMLAnchorElement>('.tab-button');
        this.tabContents = document.querySelectorAll<HTMLElement>('.tab-content');

        if (this.tabs.length === 0) {
            throw new Error('TabNavigationIsland requires .tab-button elements');
        }
    }

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

    private handlePopState = (e: PopStateEvent): void => {
        const targetTab = e.state?.tab || 'wish';
        this.switchToTab(targetTab);
    };

    private switchToTab(targetTab: 'wish' | 'read'): void {
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

        // Update tab contents
        this.tabContents.forEach((content, index) => {
            // Assuming first content is 'wish', second is 'read'
            const isActive = (index === 0 && targetTab === 'wish') || (index === 1 && targetTab === 'read');

            if (isActive) {
                content.classList.add('active');
                content.setAttribute('aria-hidden', 'false');
            } else {
                content.classList.remove('active');
                content.setAttribute('aria-hidden', 'true');
            }
        });
    }

    override destroy(): void {
        this.tabs.forEach((tab) => {
            tab.removeEventListener('click', this.handleTabClick);
        });

        window.removeEventListener('popstate', this.handlePopState);

        super.destroy();
    }
}
