import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Browser, install, computeExecutablePath, BrowserPlatform } from '@puppeteer/browsers';

const APP = 'CalilHelper';

function isWSL() {
  return process.platform === 'linux' && os.release().toLowerCase().includes('microsoft');
}
function appDataDir() {
  if (process.platform === 'win32')
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'), APP);
  if (process.platform === 'darwin')
    return path.join(os.homedir(),'Library','Application Support',APP);
  return path.join(os.homedir(),'.local','share',APP);
}
async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }

function systemChromeCandidates() {
  if (process.platform === 'win32') return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  if (process.platform === 'darwin') return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return ['/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'];
}
async function findSystemChrome(): Promise<string|null> {
  for (const p of systemChromeCandidates()) if (await exists(p)) return p;
  return null;
}

export async function ensureExecutable(): Promise<string> {
  // 実Chrome優先。ただしWSLは基本DL運用
  if (!isWSL()) {
    const sys = await findSystemChrome();
    if (sys) return sys;
  }
  const cacheDir = path.join(appDataDir(),'chromium-cache');
  await fs.mkdir(cacheDir, { recursive: true });

  const browser: Browser = Browser.CHROMIUM;
  const buildId = '1535649';
  const platform: BrowserPlatform =
    process.platform === 'win32' ? BrowserPlatform.WIN64 :
    process.platform === 'darwin' ? (os.arch()==='arm64' ? BrowserPlatform.MAC_ARM : BrowserPlatform.MAC) :
    BrowserPlatform.LINUX;

  const execPath = computeExecutablePath({ browser, cacheDir, buildId, platform });
  if (!(await exists(execPath))) {
    console.log('Downloading Chromium for Puppeteer...');
    await install({ browser, buildId, cacheDir }); // 初回だけDL
  }
  return execPath;
}
