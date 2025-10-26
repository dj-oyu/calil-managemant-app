import { loadCookies, saveCookies, toCookieHeader, isValidSession } from './vault';
import { oauthLoginAndGetCookies } from './puppeteer-auth';
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

// Utility function to create common headers
function createHeaders(cookie: Cookie, yomitaiToken?: string): Record<string, string> {
    const headers: Record<string, string> = {
        "accept": "*/*",
        "Referer": "https://calil.jp/list/",
        "Cookie": `${cookie.name}=${cookie.value}`,
    };
    if (yomitaiToken) {
        headers["calil-yomitai-token"] = yomitaiToken;
    }
    return headers;
}

// Function to fetch Yomitai token
async function fetchYomitaiToken(cookie: Cookie): Promise<string> {
    const response = await fetch(`${BASE_URL}/infrastructure/v2/get_yomitai_token`, {
        headers: createHeaders(cookie),
        method: "GET"
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch Yomitai token: ${response.statusText}`);
    }
    const data: YomitaiTokenResponse = await response.json();
    return data['Calil-Yomitai-Token'];
}

async function fetchTotalCount(cookie: Cookie, yomitaiToken: string): Promise<number> {
    const response = await fetch(`${BASE_URL}/api/list/v2/get_total_count`, {
        headers: {
            ...createHeaders(cookie, yomitaiToken),
            "content-type": "application/json",
        },
        body: JSON.stringify({ name: "wish", startCount: 0 }),
        method: "POST"
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch total count: ${response.statusText}`);
    }
    const data: TotalCountResponse = await response.json();
    console.log(`Total books in wish list: ${data.totalCount}`);
    return data.totalCount;
}

async function fetchBookPage(cookie: Cookie, yomitaiToken: string, page: number): Promise<BookElement[]> {
    const response = await fetch(`${BASE_URL}/api/list/v2/`, {
        headers: {
            ...createHeaders(cookie, yomitaiToken),
            "content-type": "application/json",
        },
        body: JSON.stringify({ name: "wish", page, perCount: ITEMS_PER_PAGE }),
        method: "POST"
    });
    if (!response.ok) {
        console.error(`request headers: ${JSON.stringify(createHeaders(cookie, yomitaiToken))}`);
        throw new Error(`Failed to fetch book page ${page}: ${response.statusText}`);
    }
    const data: BookListResponse = await response.json();
    return data.books;
}

export async function fetchBookList(): Promise<BookElement[]> {
    let v = await loadCookies();
    if (!v) v = await ensureSession();

    const yomitaiToken = await fetchYomitaiToken(v.cookies[0]!);
    const totalCount = await fetchTotalCount(v.cookies[0]!, yomitaiToken);
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    const allBooks: BookElement[] = [];
    for (let page = 1; page <= totalPages; page++) {
        const books = await fetchBookPage(v.cookies[0]!, yomitaiToken, page);
        allBooks.push(...books);
    }
    return allBooks;
}
