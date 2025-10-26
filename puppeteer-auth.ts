import puppeteer from 'puppeteer-core';
import os from 'node:os';
import { ensureExecutable } from './browser-path';

const PROFILE = `${os.homedir()}/.config/CalilHelperProfile`; // セッション持続

export async function oauthLoginAndGetCookies(opts?: { headless?: boolean }) {
  const executablePath = await ensureExecutable();
  const browser = await puppeteer.launch({
    executablePath,
    userDataDir: PROFILE,
    headless: opts?.headless ?? false,     // 初回はfalse推奨
    args: [
      process.platform === 'linux' ? '--no-sandbox' : '',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ].filter(Boolean),
    defaultViewport: null,
  });
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/129.0.0.0 Safari/537.36'
  );
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator,'webdriver',{get:()=>false});
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
