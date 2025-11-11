import {
    loadCookies,
    saveCookies,
    toCookieHeader,
    isValidSession,
} from "../../auth/session/vault.store";
import { oauthLoginAndGetCookies } from "../../auth/puppeteer/oauth-login";
import type { Cookie } from "puppeteer";
import { create } from "node:domain";

export async function ensureSession(): Promise<{ cookies: Cookie[] }> {
    let v = await loadCookies();
    if (v && (await isValidSession(v))) return v;
    // 失効 or 未保存 → 再ログイン。2回目以降はたいてい無人で通過
    const cookies = await oauthLoginAndGetCookies({ headless: false });
    await saveCookies(cookies);
    return { cookies };
}

const BASE_URL = "https://calil.jp";
const ITEMS_PER_PAGE = 20;

// Cache configuration
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

// In-memory cache for tokens and metadata
const cache = new Map<string, CacheEntry<any>>();

function getCacheKey(type: string, listType?: string): string {
    return listType ? `${listType}:${type}` : type;
}

function getFromCache<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }

    return entry.value as T;
}

function setInCache<T>(
    key: string,
    value: T,
    ttlMs: number = CACHE_TTL_MS,
): void {
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}

function clearCache(pattern?: string): void {
    if (pattern) {
        // Clear specific cache entries matching pattern
        for (const key of cache.keys()) {
            if (key.includes(pattern)) {
                cache.delete(key);
            }
        }
    } else {
        // Clear all cache
        cache.clear();
    }
}

// Types
type BookElement = {
    author: string;
    id: string;
    isbn: string;
    pubdate: string;
    publisher: string;
    source: string;
    title: string;
    updated: string;
    volume: string;
};

type BookListResponse = { books: BookElement[] };

type YomitaiTokenResponse = { "Calil-Yomitai-Token": string };

type TotalCountResponse = { totalCount: number };

type ListType = "wish" | "read";

interface FetchListOptions {
    cookie: Cookie;
    yomitaiToken?: YomitaiTokenResponse;
    listType?: ListType;
    page?: number;
}

// Utility function to create common headers
function createHeaders({
    cookie,
    yomitaiToken,
}: FetchListOptions): Record<string, string> {
    const headers: Record<string, string> = {
        accept: "*/*",
        Referer: "https://calil.jp/list",
        Cookie: `${cookie.name}=${cookie.value}`,
    };
    if (yomitaiToken) {
        headers["Calil-Yomitai-Token"] = yomitaiToken["Calil-Yomitai-Token"];
    }
    return headers;
}

// Singleton token fetch to prevent concurrent requests
let tokenFetchPromise: Promise<YomitaiTokenResponse> | null = null;

// Function to fetch Yomitai token with cache
async function fetchYomitaiToken(
    cookie: Cookie,
): Promise<YomitaiTokenResponse> {
    const cacheKey = getCacheKey("yomitai-token");

    // Try to get from cache
    const cached = getFromCache<YomitaiTokenResponse>(cacheKey);
    if (cached) {
        console.log("Using cached Yomitai token");
        return cached;
    }

    // If a token fetch is already in progress, wait for it
    if (tokenFetchPromise) {
        console.log("Token fetch already in progress, waiting...");
        return await tokenFetchPromise;
    }

    // Perform the actual token fetch
    const performFetch = async (): Promise<YomitaiTokenResponse> => {
        // Double-check cache in case another request completed while we were waiting
        const cachedAfterWait = getFromCache<YomitaiTokenResponse>(cacheKey);
        if (cachedAfterWait) {
            console.log("Using cached Yomitai token (found after wait)");
            return cachedAfterWait;
        }

        // Fetch from API
        const response = await fetch(
            `${BASE_URL}/infrastructure/v2/get_yomitai_token`,
            {
                headers: createHeaders({ cookie }),
                method: "GET",
            },
        );
        if (!response.ok) {
            throw new Error(
                `Failed to fetch Yomitai token: ${response.statusText}`,
            );
        }
        const data: YomitaiTokenResponse = await response.json();

        // Store in cache
        setInCache(cacheKey, data);
        console.log("Fetched and cached new Yomitai token");

        return data;
    };

    try {
        tokenFetchPromise = performFetch();
        const result = await tokenFetchPromise;
        return result;
    } finally {
        tokenFetchPromise = null;
    }
}

/**
 * Common function to ensure valid session and token
 * Handles session refresh and token caching with auto-retry on expiration
 */
async function ensureSessionAndToken(): Promise<{
    cookie: Cookie;
    yomitaiToken: YomitaiTokenResponse;
}> {
    let v = await loadCookies();
    if (!v || !(await isValidSession(v))) {
        v = await ensureSession();
        clearCache();
        console.log("Session refreshed, cleared all caches");
    }

    let yomitaiToken: YomitaiTokenResponse;
    try {
        yomitaiToken = await fetchYomitaiToken(v.cookies[0]!);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Unauthorized")) {
            v = await ensureSession();
            clearCache();
            console.log(
                "Unauthorized error, refreshed session and cleared caches",
            );
            yomitaiToken = await fetchYomitaiToken(v.cookies[0]!);
        } else {
            throw error;
        }
    }

    return {
        cookie: v.cookies[0]!,
        yomitaiToken,
    };
}

/**
 * Retry function with token refresh on Forbidden/Unauthorized errors
 */
async function retryWithTokenRefresh<T>(
    operation: (
        cookie: Cookie,
        yomitaiToken: YomitaiTokenResponse,
    ) => Promise<T>,
): Promise<T> {
    const { cookie, yomitaiToken } = await ensureSessionAndToken();

    try {
        return await operation(cookie, yomitaiToken);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // If token expired (Forbidden/Unauthorized), clear token cache and retry
        if (
            message.includes("Token expired") ||
            message.includes("unauthorized") ||
            message.includes("Forbidden")
        ) {
            console.log(
                "Token expired or forbidden, clearing token cache and retrying",
            );
            // Clear token cache
            clearCache("yomitai-token");
            // Get fresh session and token
            const refreshed = await ensureSessionAndToken();
            // Retry the operation
            return await operation(refreshed.cookie, refreshed.yomitaiToken);
        }
        throw error;
    }
}

async function fetchTotalCount({
    cookie,
    yomitaiToken,
    listType,
}: FetchListOptions): Promise<number> {
    const cacheKey = getCacheKey("total-count", listType);

    // Try to get from cache
    const cached = getFromCache<number>(cacheKey);
    if (cached !== null) {
        console.log(`Using cached total count for ${listType}: ${cached}`);
        return cached;
    }

    // Fetch from API
    const response = await fetch(`${BASE_URL}/api/list/v2/get_total_count`, {
        headers: {
            ...createHeaders({ cookie, yomitaiToken }),
            "content-type": "application/json",
        },
        body: JSON.stringify({ name: listType, startCount: 0 }),
        method: "POST",
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch total count: ${response.statusText}`);
    }
    const data: TotalCountResponse = await response.json();
    console.log(`Total books in ${listType} list: ${data.totalCount}`);

    // Store in cache
    setInCache(cacheKey, data.totalCount);

    return data.totalCount;
}

async function fetchBookPage({
    cookie,
    yomitaiToken,
    listType,
    page,
}: FetchListOptions): Promise<BookElement[]> {
    const response = await fetch(`${BASE_URL}/api/list/v2/`, {
        headers: {
            ...createHeaders({ cookie, yomitaiToken }),
            "content-type": "application/json",
        },
        body: JSON.stringify({
            name: listType,
            page,
            perCount: ITEMS_PER_PAGE,
        }),
        method: "POST",
    });
    if (!response.ok) {
        console.error(
            `request headers: ${JSON.stringify(createHeaders({ cookie, yomitaiToken }))}`,
        );

        // If Forbidden or Unauthorized, the token might be expired
        if (response.status === 403 || response.status === 401) {
            throw new Error(
                `Token expired or unauthorized: ${response.statusText}`,
            );
        }

        throw new Error(
            `Failed to fetch book page ${page}: ${response.statusText}`,
        );
    }
    const data: BookListResponse = await response.json();
    return data.books;
}

/**
 * Get metadata about the book list (total count, total pages)
 * Results are cached for 1 hour
 */
export async function fetchBookListMetadata(
    listType: ListType,
): Promise<{ totalCount: number; totalPages: number; pageSize: number }> {
    const cacheKey = getCacheKey("metadata", listType);

    // Try to get from cache
    const cached = getFromCache<{
        totalCount: number;
        totalPages: number;
        pageSize: number;
    }>(cacheKey);
    if (cached) {
        console.log(`Using cached metadata for ${listType}:`, cached);
        return cached;
    }

    // Fetch from API with auto-retry on token expiration
    return await retryWithTokenRefresh(async (cookie, yomitaiToken) => {
        const totalCount = await fetchTotalCount({
            cookie,
            yomitaiToken,
            listType,
        });
        const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

        const metadata = { totalCount, totalPages, pageSize: ITEMS_PER_PAGE };

        // Store in cache
        setInCache(cacheKey, metadata);

        return metadata;
    });
}

/**
 * Fetch a single page of books
 */
export async function fetchBookListPage(
    listType: ListType,
    page: number,
): Promise<BookElement[]> {
    // Fetch from API with auto-retry on token expiration
    return await retryWithTokenRefresh(async (cookie, yomitaiToken) => {
        return await fetchBookPage({
            cookie,
            yomitaiToken,
            listType,
            page,
        });
    });
}

/**
 * Fetch multiple pages of books
 */
export async function fetchBookListPages(
    listType: ListType,
    startPage: number,
    endPage: number,
): Promise<BookElement[]> {
    const allBooks: BookElement[] = [];
    for (let page = startPage; page <= endPage; page++) {
        const books = await fetchBookListPage(listType, page);
        allBooks.push(...books);
    }
    return allBooks;
}

/**
 * Fetch all books (legacy function for backward compatibility)
 */
export async function fetchBookList(
    listType: ListType,
): Promise<BookElement[]> {
    const metadata = await fetchBookListMetadata(listType);
    return await fetchBookListPages(listType, 1, metadata.totalPages);
}
