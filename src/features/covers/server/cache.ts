// Cover image caching system

import { existsSync } from "node:fs";
import path from "node:path";
import { logger } from "../../../shared/logging/logger";
import { appPaths, ensureDir } from "../../../shared/config/app-paths";

const CACHE_DIR = appPaths.coverCache;

// Negative cache for 404 responses (ISBNs that don't have covers)
// TTL: 24 hours
const NOT_FOUND_CACHE = new Map<string, number>();
const NOT_FOUND_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if ISBN is in the negative cache (known to not have a cover)
 */
function isNotFoundCached(isbn: string): boolean {
    const cachedTime = NOT_FOUND_CACHE.get(isbn);
    if (!cachedTime) return false;

    // Check if cache entry is still valid
    if (Date.now() - cachedTime > NOT_FOUND_TTL) {
        NOT_FOUND_CACHE.delete(isbn);
        return false;
    }

    return true;
}

/**
 * Add ISBN to negative cache
 */
function addToNotFoundCache(isbn: string): void {
    NOT_FOUND_CACHE.set(isbn, Date.now());
}

// Initialize cache directory
export async function initCoverCache() {
    const existed = existsSync(CACHE_DIR);
    await ensureDir(CACHE_DIR);
    if (!existed) {
        logger.info("Cover cache directory created", { path: CACHE_DIR });
    }
}

// Get cached cover or fetch from NDL
export async function getCoverImage(
    isbn: string,
): Promise<{ path: string; contentType: string } | null> {
    // Check negative cache first (known 404s)
    if (isNotFoundCached(isbn)) {
        logger.debug("Cover known to not exist (negative cache hit)", { isbn });
        return null;
    }

    const cachePath = path.join(CACHE_DIR, `${isbn}.jpg`);

    // Check positive cache (actual image file)
    if (existsSync(cachePath)) {
        logger.debug("Cover image cache hit", { isbn });
        return {
            path: cachePath,
            contentType: "image/jpeg",
        };
    }

    // Fetch from NDL
    logger.debug("Fetching cover from NDL", { isbn });
    try {
        const response = await fetch(
            `https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`,
        );

        if (!response.ok) {
            if (response.status === 404) {
                logger.debug("Cover not found on NDL", { isbn });
                // Add to negative cache to prevent future attempts
                addToNotFoundCache(isbn);
            } else {
                logger.warn("NDL cover fetch failed", {
                    isbn,
                    status: response.status,
                });
            }
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();

        // Cache the image
        try {
            await Bun.write(cachePath, arrayBuffer);
            logger.info("Cover image cached", {
                isbn,
                path: cachePath,
                size: arrayBuffer.byteLength,
            });
        } catch (writeError) {
            logger.error("Failed to write cover image to cache", {
                isbn,
                path: cachePath,
                error: String(writeError),
            });
            throw writeError;
        }

        return {
            path: cachePath,
            contentType: "image/jpeg",
        };
    } catch (error) {
        logger.error("Failed to fetch cover image", {
            isbn,
            error: String(error),
        });
        return null;
    }
}
