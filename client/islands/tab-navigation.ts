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
/**
 * Metadata for paginated list
 */
interface ListMetadata {
    totalCount: number;
    totalPages: number;
    pageSize: number;
    loadedPages: Set<number>;
    isLoading: boolean;
}

export class TabNavigationIsland extends Island {
    /** All tab button elements */
    private tabs: NodeListOf<HTMLAnchorElement>;

    /** All tab content elements */
    private tabContents: NodeListOf<HTMLElement>;

    /** Download button element */
    private downloadButton: HTMLAnchorElement | null = null;

    /** Metadata for each list type */
    private metadata: Map<string, ListMetadata> = new Map();

    /** IntersectionObserver for infinite scroll */
    private scrollObserver: IntersectionObserver | null = null;

    /** Maximum pages to fetch on initial load */
    private readonly INITIAL_MAX_PAGES = 2;

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
        this.downloadButton = document.querySelector<HTMLAnchorElement>('.download-button');

        if (this.tabs.length === 0) {
            throw new Error('TabNavigationIsland requires .tab-button elements');
        }

        // Initialize scroll observer
        this.initScrollObserver();
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

        // Update download button URL
        if (this.downloadButton) {
            this.downloadButton.href = `/api/download/bibliographic/${targetTab}`;
            logger.debug('📥 Updated download button URL:', this.downloadButton.href);
        }

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
     * Initialize IntersectionObserver for infinite scroll
     * @private
     */
    private initScrollObserver(): void {
        this.scrollObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const sentinel = entry.target as HTMLElement;
                        const listType = sentinel.dataset.listType;
                        if (listType) {
                            logger.debug('📜 Scroll sentinel visible, loading more:', listType);
                            this.loadMorePages(listType as 'wish' | 'read');
                        }
                    }
                });
            },
            {
                rootMargin: '200px', // Start loading 200px before reaching the sentinel
                threshold: 0.1,
            }
        );
    }

    /**
     * Create a scroll sentinel element for infinite scroll
     * @private
     */
    private createScrollSentinel(listType: string): HTMLElement {
        const sentinel = document.createElement('div');
        sentinel.className = 'scroll-sentinel';
        sentinel.dataset.listType = listType;
        sentinel.style.cssText = 'height: 1px; margin: 2rem 0;';
        return sentinel;
    }

    /**
     * Create a loading indicator element
     * @private
     */
    private createLoadingIndicator(): HTMLElement {
        const indicator = document.createElement('div');
        indicator.className = 'loading-indicator';
        indicator.style.cssText = 'padding: 2rem; text-align: center; color: #666;';
        indicator.innerHTML = `
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⏳</div>
            <div>読み込み中...</div>
        `;
        return indicator;
    }

    /**
     * Load tab content dynamically from the API using paginated streaming
     * Receives: meta (with totalPages), then pages one by one
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

        // Show default Skeleton UI as initial loading state
        logger.debug('⏳ Showing initial Skeleton UI for:', listType);
        const defaultSkeletonCount = 10;
        contentElement.innerHTML = this.generateSkeletonHTML(defaultSkeletonCount);

        try {
            logger.debug(`🌐 Fetching /api/book-list-stream/${listType}?maxPages=${this.INITIAL_MAX_PAGES}`);
            const response = await fetch(`/api/book-list-stream/${listType}?maxPages=${this.INITIAL_MAX_PAGES}`);

            logger.debug(`📊 Response status: ${response.status}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Read streaming NDJSON response
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body is not readable');
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let ulElement: HTMLUListElement | null = null;

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    logger.debug('📥 Stream completed');
                    break;
                }

                // Decode chunk and append to buffer
                buffer += decoder.decode(value, { stream: true });

                // Process complete lines (NDJSON format)
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const data = JSON.parse(line);
                        logger.debug('📦 Received data:', { type: data.type });

                        if (data.type === 'meta') {
                            // Store metadata
                            this.metadata.set(listType, {
                                totalCount: data.totalCount,
                                totalPages: data.totalPages,
                                pageSize: data.pageSize,
                                loadedPages: new Set(),
                                isLoading: false,
                            });
                            logger.info(`📊 Received metadata:`, data);

                            // Update Skeleton count based on initial pages
                            const initialItemCount = Math.min(this.INITIAL_MAX_PAGES * data.pageSize, data.totalCount);
                            contentElement.innerHTML = this.generateSkeletonHTML(initialItemCount);

                            // Create UL element for books
                            ulElement = document.createElement('ul');
                        } else if (data.type === 'page') {
                            // Append page HTML to UL
                            if (ulElement) {
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = data.html;
                                Array.from(tempDiv.children).forEach(child => {
                                    ulElement!.appendChild(child);
                                });

                                // Update loaded pages
                                const meta = this.metadata.get(listType);
                                if (meta) {
                                    meta.loadedPages.add(data.pageNumber);
                                }

                                logger.info(`📄 Loaded page ${data.pageNumber}`);
                            }
                        } else if (data.type === 'done') {
                            // Replace Skeleton with actual content
                            if (ulElement) {
                                contentElement.innerHTML = '';
                                contentElement.appendChild(ulElement);

                                // Add scroll sentinel if there are more pages
                                const meta = this.metadata.get(listType);
                                if (meta && meta.loadedPages.size < meta.totalPages) {
                                    const sentinel = this.createScrollSentinel(listType);
                                    contentElement.appendChild(sentinel);

                                    // Start observing
                                    if (this.scrollObserver) {
                                        this.scrollObserver.observe(sentinel);
                                    }

                                    logger.info(`📜 Scroll sentinel added (${meta.loadedPages.size}/${meta.totalPages} pages loaded)`);
                                }

                                contentElement.dataset.loaded = 'true';

                                logger.debug('🏝️ Dispatching island:reload event');
                                // Re-hydrate any islands in the newly loaded content
                                const event = new CustomEvent('island:reload', { detail: { container: contentElement } });
                                document.dispatchEvent(event);

                                logger.info('✅ Tab content loaded successfully for:', listType);
                            }
                        } else if (data.type === 'error') {
                            throw new Error(data.value);
                        }
                    } catch (parseError) {
                        logger.error('Failed to parse streaming data', parseError, { line });
                    }
                }
            }
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
     * Load more pages when scrolling (infinite scroll)
     * @private
     */
    private async loadMorePages(listType: 'wish' | 'read'): Promise<void> {
        const meta = this.metadata.get(listType);
        if (!meta) {
            logger.warn('No metadata found for:', listType);
            return;
        }

        // Check if already loading or all pages loaded
        if (meta.isLoading || meta.loadedPages.size >= meta.totalPages) {
            logger.debug('Already loading or all pages loaded:', { listType, loaded: meta.loadedPages.size, total: meta.totalPages });
            return;
        }

        // Find next page to load
        const nextPage = meta.loadedPages.size + 1;
        if (nextPage > meta.totalPages) {
            logger.debug('No more pages to load');
            return;
        }

        meta.isLoading = true;
        logger.info(`📥 Loading page ${nextPage}/${meta.totalPages} for ${listType}`);

        // Find content element and UL
        const contentElement = document.querySelector<HTMLElement>(`.tab-content[data-list-type="${listType}"]`);
        if (!contentElement) {
            logger.error('Content element not found');
            meta.isLoading = false;
            return;
        }

        const ulElement = contentElement.querySelector('ul');
        if (!ulElement) {
            logger.error('UL element not found');
            meta.isLoading = false;
            return;
        }

        // Remove sentinel temporarily and add loading indicator
        const sentinel = contentElement.querySelector('.scroll-sentinel');
        const loadingIndicator = this.createLoadingIndicator();
        if (sentinel) {
            sentinel.replaceWith(loadingIndicator);
        }

        try {
            const response = await fetch(`/api/book-list-page/${listType}/${nextPage}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();

            // Append new items to UL
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            Array.from(tempDiv.children).forEach(child => {
                ulElement.appendChild(child);
            });

            // Update metadata
            meta.loadedPages.add(nextPage);
            logger.info(`✅ Page ${nextPage} loaded successfully`);

            // Re-hydrate islands in new content
            const event = new CustomEvent('island:reload', { detail: { container: ulElement } });
            document.dispatchEvent(event);

            // Remove loading indicator and restore sentinel if more pages exist
            loadingIndicator.remove();
            if (meta.loadedPages.size < meta.totalPages) {
                const newSentinel = this.createScrollSentinel(listType);
                contentElement.appendChild(newSentinel);
                if (this.scrollObserver) {
                    this.scrollObserver.observe(newSentinel);
                }
            } else {
                // All pages loaded - show completion message
                const completionMessage = document.createElement('div');
                completionMessage.style.cssText = 'padding: 2rem; text-align: center; color: #666;';
                completionMessage.innerHTML = `
                    <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">✅</div>
                    <div>すべての本を読み込みました (${meta.totalCount}件)</div>
                `;
                contentElement.appendChild(completionMessage);
            }
        } catch (error) {
            logger.error('Failed to load more pages', error, { listType, page: nextPage });

            // Show error message
            loadingIndicator.innerHTML = `
                <div style="color: #cc0000;">
                    <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⚠️</div>
                    <div>読み込みに失敗しました</div>
                    <button
                        onclick="location.reload()"
                        style="
                            margin-top: 1rem;
                            padding: 0.5rem 1rem;
                            background: #0969da;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                        "
                    >
                        🔄 再読み込み
                    </button>
                </div>
            `;
        } finally {
            meta.isLoading = false;
        }
    }

    /**
     * Cleanup event listeners when island is destroyed
     * Removes both tab click listeners, popstate listener, and scroll observer
     *
     * @override
     */
    override destroy(): void {
        this.tabs.forEach((tab) => {
            tab.removeEventListener('click', this.handleTabClick);
        });

        window.removeEventListener('popstate', this.handlePopState);

        // Disconnect scroll observer
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
            this.scrollObserver = null;
        }

        super.destroy();
    }
}
