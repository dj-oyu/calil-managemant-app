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
    logger.info("Initializing cover cache", {
        path: CACHE_DIR,
        exists: existed,
    });
    await ensureDir(CACHE_DIR);
    const nowExists = existsSync(CACHE_DIR);
    logger.info("Cover cache directory initialized", {
        path: CACHE_DIR,
        existed,
        nowExists,
        createdNew: !existed && nowExists,
    });
}

// Get cached cover or fetch from NDL
export async function getCoverImage(
    isbn: string,
): Promise<{ path: string; contentType: string } | null> {
    logger.debug("getCoverImage called", { isbn, cacheDir: CACHE_DIR });

    // Check negative cache first (known 404s)
    if (isNotFoundCached(isbn)) {
        logger.debug("Cover known to not exist (negative cache hit)", { isbn });
        return null;
    }

    const cachePath = path.join(CACHE_DIR, `${isbn}.jpg`);
    logger.debug("Cache path resolved", { isbn, cachePath });

    // Check positive cache (actual image file)
    if (existsSync(cachePath)) {
        logger.debug("Cover image cache hit", { isbn });
        return {
            path: cachePath,
            contentType: "image/jpeg",
        };
    }

    // Fetch from NDL
    const ndlUrl = `https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`;
    logger.debug("Fetching cover from NDL", { isbn, url: ndlUrl });
    try {
        const response = await fetch(ndlUrl);
        logger.debug("NDL response received", {
            isbn,
            status: response.status,
            ok: response.ok,
        });

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
        logger.debug("Image data received from NDL", {
            isbn,
            size: arrayBuffer.byteLength,
        });

        // Cache the image
        try {
            logger.debug("Attempting to write image to cache", {
                isbn,
                path: cachePath,
                size: arrayBuffer.byteLength,
                cacheDir: CACHE_DIR,
                cacheDirExists: existsSync(CACHE_DIR),
            });
            await Bun.write(cachePath, arrayBuffer);
            const written = existsSync(cachePath);
            logger.info("Cover image cached", {
                isbn,
                path: cachePath,
                size: arrayBuffer.byteLength,
                fileExists: written,
            });
        } catch (writeError) {
            logger.error("Failed to write cover image to cache", {
                isbn,
                path: cachePath,
                error: String(writeError),
                errorStack: writeError instanceof Error ? writeError.stack : undefined,
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
