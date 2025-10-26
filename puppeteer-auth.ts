import puppeteer, { Browser, Page } from 'puppeteer-core';
import os from 'node:os';
import { ensureExecutable } from './browser-path';
import fs from 'node:fs/promises';

const ENDPOINT_FILE = './.vault/chrome.ws';
const PROFILE = `${os.homedir()}/.config/CalilHelperProfile`; // セッション持続

async function saveEndpoint(ws: string) {
    await fs.mkdir('./.vault', { recursive: true });
    await fs.writeFile(ENDPOINT_FILE, ws, 'utf8');
}

async function loadEndpoint(): Promise<string | null> {
    try { return await fs.readFile(ENDPOINT_FILE, 'utf8'); } catch { return null; }
}

export async function oauthLoginAndGetCookies(opts?: { headless?: boolean }) {
    let browser: Browser | undefined;
    let page: Page | undefined;

    const launch_browser = async () => {
        const executablePath = await ensureExecutable();
        const b = await puppeteer.launch({
                executablePath,
                userDataDir: PROFILE,
                headless: opts?.headless ?? true,     // 初回はfalse推奨
                args: [
                    process.platform === 'linux' ? '--no-sandbox' : '',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    '--remote-debugging-port=0',
                ].filter(Boolean),
                defaultViewport: null,
            });
        const ws = b.wsEndpoint();
        saveEndpoint(ws);
        return b;
    };
    const existingWs = await loadEndpoint();
    if (existingWs) {
        try {
            browser = await puppeteer.connect({ browserWSEndpoint: existingWs });
            const pages = await browser.pages();
            page = pages.length > 0 ? pages[0] : await browser.newPage();
        } catch {
            // 接続失敗 → 新規起動へ
            browser = await launch_browser();
            page = await browser.newPage();
        }
    }

    if (!page) {
        browser = await launch_browser();
        page = await browser.newPage();
    }
    if (!browser || !page) throw new Error('Failed to launch or connect to browser');

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/129.0.0.0 Safari/537.36'
    );
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.goto('https://login.calil.jp/google_login?redirect=%2F', { waitUntil: 'networkidle2' });

    // 1回目は手動で“Allow”。2回目以降はプロファイルにより自動通過しやすい
    await page.waitForFunction(
        () => location.hostname.endsWith('calil.jp') && location.pathname === '/',
        { timeout: 180_000 }
    );

    const all_cookies = await browser.cookies();
    const cookies = [
        ...(all_cookies.filter(c => c.domain.endsWith('calil.jp'))),
        ...(all_cookies.filter(c => c.path.startsWith('https://login.calil.jp'))),
    ];

    await browser.close();
    return cookies;
}
