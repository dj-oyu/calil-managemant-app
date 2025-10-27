// Cover image caching system

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { logger } from '../../../shared/logging/logger';

const CACHE_DIR = './cache/covers';

// Initialize cache directory
export async function initCoverCache() {
    if (!existsSync(CACHE_DIR)) {
        await mkdir(CACHE_DIR, { recursive: true });
        logger.info('Cover cache directory created', { path: CACHE_DIR });
    }
}

// Get cached cover or fetch from NDL
export async function getCoverImage(isbn: string): Promise<{ path: string; contentType: string } | null> {
    const cachePath = `${CACHE_DIR}/${isbn}.jpg`;

    // Check cache first
    if (existsSync(cachePath)) {
        logger.debug('Cover image cache hit', { isbn });
        return {
            path: cachePath,
            contentType: 'image/jpeg',
        };
    }

    // Fetch from NDL
    logger.debug('Fetching cover from NDL', { isbn });
    try {
        const response = await fetch(`https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`);

        if (!response.ok) {
            if (response.status === 404) {
                logger.debug('Cover not found on NDL', { isbn });
            } else {
                logger.warn('NDL cover fetch failed', { isbn, status: response.status });
            }
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();

        // Cache the image
        await Bun.write(cachePath, arrayBuffer);
        logger.info('Cover image cached', { isbn, size: arrayBuffer.byteLength });

        return {
            path: cachePath,
            contentType: 'image/jpeg',
        };
    } catch (error) {
        logger.error('Failed to fetch cover image', { isbn, error: String(error) });
        return null;
    }
}
