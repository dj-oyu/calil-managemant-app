import puppeteer, { Browser, type Cookie } from 'puppeteer';
import { Hono } from 'hono';

// Constants
const LOGIN_URL = 'https://login.calil.jp/google_login?redirect=%2F';
const BASE_URL = 'https://calil.jp';
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PAGE_TIMEOUT = 90_000;
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

// Function to get login cookie using Puppeteer
async function getLoginCookie(browser: Browser): Promise<Cookie | undefined> {
    try {
        // Check if cookie already exists
        const existingCookies = await browser.cookies();
        const cookie = existingCookies.find(c => c.domain.endsWith('calil.jp'));
        if (cookie) {
            return cookie;
        }

        // Launch login page
        const page = await browser.newPage();
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });

        // Wait for user to complete login and return to calil.jp root
        await page.waitForFunction(
            () => location.hostname.endsWith('calil.jp') && location.pathname === '/',
            { timeout: TIMEOUT_MS }
        );

        // Retrieve the cookie after login
        const cookies = await browser.cookies();
        return cookies.find(c => c.domain.endsWith('calil.jp'));
    } catch (error) {
        console.error('Error during login:', error);
        return undefined;
    }
}

// Function to fetch Yomitai token
async function fetchYomitaiToken(cookie: Cookie): Promise<string> {
    const response = await fetch(`${BASE_URL}/infrastructure/v2/get_yomitai_token`, {
        headers: createHeaders(cookie),
        method: "GET"
    });
    const data: YomitaiTokenResponse = await response.json();
    return data['Calil-Yomitai-Token'];
}

// Function to fetch total count of books
async function fetchTotalCount(cookie: Cookie, yomitaiToken: string): Promise<number> {
    const response = await fetch(`${BASE_URL}/api/list/v2/get_total_count`, {
        headers: {
            ...createHeaders(cookie, yomitaiToken),
            "content-type": "application/json",
        },
        body: JSON.stringify({ name: "wish", startCount: 0 }),
        method: "POST"
    });
    const data: TotalCountResponse = await response.json();
    return data.totalCount;
}

// Function to fetch a page of book list
async function fetchBookPage(cookie: Cookie, yomitaiToken: string, page: number): Promise<BookElement[]> {
    const response = await fetch(`${BASE_URL}/api/list/v2/`, {
        headers: {
            ...createHeaders(cookie, yomitaiToken),
            "content-type": "application/json",
        },
        body: JSON.stringify({ name: "wish", page, perCount: ITEMS_PER_PAGE }),
        method: "POST"
    });
    const data: BookListResponse = await response.json();
    return data.books;
}

// Main application setup
async function setupApp(): Promise<Hono> {
    // Launch browser and get cookie
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars'
        ]
    });

    try {
        const cookie = await getLoginCookie(browser);
        if (!cookie) {
            throw new Error('Failed to obtain login cookie.');
        }

        // Close browser after getting cookie
        await browser.close();

        // Create Hono app
        const app = new Hono();

        app.get('/', async (c) => {
            try {
                // Fetch token and total count
                const yomitaiToken = await fetchYomitaiToken(cookie);
                const totalCount = await fetchTotalCount(cookie, yomitaiToken);

                // Fetch all pages
                const results: BookElement[] = [];
                const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

                for (let page = 1; page <= totalPages; page++) {
                    const books = await fetchBookPage(cookie, yomitaiToken, page);
                    results.push(...books);
                }

                return c.json(results);
            } catch (error) {
                console.error('Error fetching book list:', error);
                return c.json({ error: 'Failed to fetch book list' }, 500);
            }
        });

        return app;
    } catch (error) {
        await browser.close();
        throw error;
    }
}

// Export the app for use
const app = await setupApp();
export default app;