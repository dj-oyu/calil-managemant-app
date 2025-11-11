import puppeteer, { Browser, Page } from 'puppeteer-core';
import { ensureExecutable } from './browser-path';
import fs from 'node:fs/promises';
import { appPaths, ensureDir } from '../../../shared/config/app-paths';
import { logger } from '../../../shared/logging/logger';

const ENDPOINT_FILE = appPaths.chromeEndpointFile;
const PROFILE = appPaths.browserProfile; // セッション持続

// Singleton browser instance
let cachedBrowser: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

async function saveEndpoint(ws: string) {
    await ensureDir(appPaths.vaultDir);
    await fs.writeFile(ENDPOINT_FILE, ws, 'utf8');
}

async function loadEndpoint(): Promise<string | null> {
    try { return await fs.readFile(ENDPOINT_FILE, 'utf8'); } catch { return null; }
}

// Clean up browser on process exit
process.on('exit', () => {
    if (cachedBrowser) {
        logger.info('Closing browser on process exit');
        // Synchronous close is not supported, but we mark it as null
        cachedBrowser = null;
    }
});

process.on('SIGINT', async () => {
    if (cachedBrowser) {
        logger.info('Closing browser on SIGINT');
        await cachedBrowser.close();
        cachedBrowser = null;
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (cachedBrowser) {
        logger.info('Closing browser on SIGTERM');
        await cachedBrowser.close();
        cachedBrowser = null;
    }
    process.exit(0);
});

async function getBrowserInstance(opts?: { headless?: boolean }): Promise<Browser> {
    // If we have a cached browser, verify it's still connected
    if (cachedBrowser) {
        try {
            await cachedBrowser.version(); // Test connection
            logger.debug('Reusing existing browser instance');
            return cachedBrowser;
        } catch (error) {
            logger.warn('Cached browser is disconnected, will launch new one');
            cachedBrowser = null;
        }
    }

    // If another request is already launching, wait for it
    if (browserLaunchPromise) {
        logger.debug('Browser launch already in progress, waiting...');
        return await browserLaunchPromise;
    }

    // Launch new browser
    const launch_browser = async (): Promise<Browser> => {
        logger.info('Launching new browser instance');
        const executablePath = await ensureExecutable();
        await ensureDir(PROFILE);
        const b = await puppeteer.launch({
            executablePath,
            userDataDir: PROFILE,
            headless: opts?.headless ?? true,
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
        await saveEndpoint(ws);
        logger.info('Browser launched successfully');
        return b;
    };

    try {
        browserLaunchPromise = launch_browser();
        cachedBrowser = await browserLaunchPromise;
        return cachedBrowser;
    } finally {
        browserLaunchPromise = null;
    }
}

export async function oauthLoginAndGetCookies(opts?: { headless?: boolean }) {
    const browser = await getBrowserInstance(opts);
    const page = await browser.newPage();

    try {
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/129.0.0.0 Safari/537.36'
        );
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        await page.goto('https://login.calil.jp/google_login?redirect=%2F', { waitUntil: 'networkidle2' });

        // 1回目は手動で"Allow"。2回目以降はプロファイルにより自動通過しやすい
        await page.waitForFunction(
            () => location.hostname.endsWith('calil.jp') && location.pathname === '/',
            { timeout: 180_000 }
        );

        const all_cookies = await browser.cookies();
        const cookies = [
            ...(all_cookies.filter(c => c.domain.endsWith('calil.jp'))),
            ...(all_cookies.filter(c => c.path.startsWith('https://login.calil.jp'))),
        ];

        return cookies;
    } finally {
        // Close only the page, keep browser running for reuse
        await page.close();
    }
}
