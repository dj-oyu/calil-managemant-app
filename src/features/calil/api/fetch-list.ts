import { loadCookies, saveCookies, toCookieHeader, isValidSession } from '../../auth/session/vault.store';
import { oauthLoginAndGetCookies } from '../../auth/puppeteer/oauth-login';
import type { Cookie } from 'puppeteer';
import { create } from 'node:domain';

export async function ensureSession(): Promise<{ cookies: Cookie[] }> {
  let v = await loadCookies();
  if (v && await isValidSession(v)) return v;
  // 失効 or 未保存 → 再ログイン。2回目以降はたいてい無人で通過
  const cookies = await oauthLoginAndGetCookies({ headless: false });
  await saveCookies(cookies);
  return { cookies };
}

const BASE_URL = 'https://calil.jp';
const ITEMS_PER_PAGE = 20;

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

type YomitaiTokenResponse = { 'Calil-Yomitai-Token': string };

type TotalCountResponse = { totalCount: number };

type ListType = 'wish' | 'read';

interface FetchListOptions {
    cookie: Cookie;
    yomitaiToken?: YomitaiTokenResponse;
    listType?: ListType;
    page?: number;
}

// Utility function to create common headers
function createHeaders({ cookie, yomitaiToken }: FetchListOptions): Record<string, string> {
    const headers: Record<string, string> = {
        "accept": "*/*",
        "Referer": "https://calil.jp/list",
        "Cookie": `${cookie.name}=${cookie.value}`,
    };
    if (yomitaiToken) {
        headers["Calil-Yomitai-Token"] = yomitaiToken['Calil-Yomitai-Token'];
    }
    return headers;
}

// Function to fetch Yomitai token
async function fetchYomitaiToken(cookie: Cookie): Promise<YomitaiTokenResponse> {
    const response = await fetch(`${BASE_URL}/infrastructure/v2/get_yomitai_token`, {
        headers: createHeaders({cookie}),
        method: "GET"
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch Yomitai token: ${response.statusText}`);
    }
    const data: YomitaiTokenResponse = await response.json();
    return data;
}

async function fetchTotalCount({ cookie, yomitaiToken, listType }: FetchListOptions): Promise<number> {
    const response = await fetch(`${BASE_URL}/api/list/v2/get_total_count`, {
        headers: {
            ...createHeaders({cookie, yomitaiToken}),
            "content-type": "application/json",
        },
        body: JSON.stringify({ name: listType, startCount: 0 }),
        method: "POST"
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch total count: ${response.statusText}`);
    }
    const data: TotalCountResponse = await response.json();
    console.log(`Total books in wish list: ${data.totalCount}`);
    return data.totalCount;
}

async function fetchBookPage({ cookie, yomitaiToken, listType, page }: FetchListOptions): Promise<BookElement[]> {
    const response = await fetch(`${BASE_URL}/api/list/v2/`, {
        headers: {
            ...createHeaders({cookie, yomitaiToken}),
            "content-type": "application/json",
        },
        body: JSON.stringify({ name: listType, page, perCount: ITEMS_PER_PAGE }),
        method: "POST"
    });
    if (!response.ok) {
        console.error(`request headers: ${JSON.stringify(createHeaders({cookie, yomitaiToken}))}`);
        throw new Error(`Failed to fetch book page ${page}: ${response.statusText}`);
    }
    const data: BookListResponse = await response.json();
    return data.books;
}

export async function fetchBookList(listType: ListType): Promise<BookElement[]> {
    let v = await loadCookies();
    if (!v || !(await isValidSession(v))) {
        v = await ensureSession();
    }

    let yomitaiToken: YomitaiTokenResponse;
    try {
        yomitaiToken = await fetchYomitaiToken(v.cookies[0]!);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Unauthorized')) {
            v = await ensureSession();
            yomitaiToken = await fetchYomitaiToken(v.cookies[0]!);
        } else {
            throw error;
        }
    }

    const totalCount = await fetchTotalCount({ cookie: v.cookies[0]!, yomitaiToken , listType});
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    const allBooks: BookElement[] = [];
    for (let page = 1; page <= totalPages; page++) {
        const books = await fetchBookPage({ cookie: v.cookies[0]!, yomitaiToken, listType, page });
        allBooks.push(...books);
    }
    return allBooks;
}
