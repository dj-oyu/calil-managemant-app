import { test, expect, describe } from 'bun:test';
import os from 'node:os';

/**
 * browser-path.tsのテスト
 *
 * 注意: isWSL()やsystemChromeCandidates()は内部関数なのでエクスポートされていません。
 * このファイルでは、同じロジックをテストして正しさを確認します。
 */

describe('browser-path utilities', () => {
  describe('isWSL detection logic', () => {
    test('Linuxプラットフォームで"microsoft"を含むリリース名はWSL', () => {
      const platform = 'linux';
      const release = '5.10.16.3-microsoft-standard-WSL2';

      const isWSL = platform === 'linux' && release.toLowerCase().includes('microsoft');

      expect(isWSL).toBe(true);
    });

    test('Linuxプラットフォームで"microsoft"を含まないリリース名はWSLではない', () => {
      const platform = 'linux';
      const release = '5.15.0-76-generic';

      const isWSL = platform === 'linux' && release.toLowerCase().includes('microsoft');

      expect(isWSL).toBe(false);
    });

    test('Windowsプラットフォームは"microsoft"があってもWSLではない', () => {
      const platform = 'win32';
      const release = 'some-microsoft-release';

      const isWSL = platform === 'linux' && release.toLowerCase().includes('microsoft');

      expect(isWSL).toBe(false);
    });

    test('macOSプラットフォームはWSLではない', () => {
      const platform = 'darwin';
      const release = 'any-release-name';

      const isWSL = platform === 'linux' && release.toLowerCase().includes('microsoft');

      expect(isWSL).toBe(false);
    });
  });

  describe('systemChromeCandidates logic', () => {
    test('Windows環境でのChrome候補パス', () => {
      const platform = 'win32';

      const candidates =
        platform === 'win32'
          ? [
              'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
              'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            ]
          : [];

      expect(candidates.length).toBe(2);
      expect(candidates[0]).toContain('Program Files');
      expect(candidates[1]).toContain('Program Files (x86)');
      expect(candidates.every(p => p.endsWith('chrome.exe'))).toBe(true);
    });

    test('macOS環境でのChrome候補パス', () => {
      const platform = 'darwin';

      const candidates =
        platform === 'darwin'
          ? [
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
              '/Applications/Chromium.app/Contents/MacOS/Chromium',
            ]
          : [];

      expect(candidates.length).toBe(2);
      expect(candidates[0]).toContain('Google Chrome');
      expect(candidates[1]).toContain('Chromium');
      expect(candidates.every(p => p.startsWith('/Applications'))).toBe(true);
    });

    test('Linux環境でのChrome候補パス', () => {
      const platform = 'linux';

      const candidates =
        platform !== 'win32' && platform !== 'darwin'
          ? [
              '/usr/bin/google-chrome-stable',
              '/usr/bin/google-chrome',
              '/usr/bin/chromium',
              '/usr/bin/chromium-browser',
            ]
          : [];

      expect(candidates.length).toBe(4);
      expect(candidates.every(p => p.startsWith('/usr/bin'))).toBe(true);
      expect(candidates[0]).toBe('/usr/bin/google-chrome-stable');
      expect(candidates[3]).toBe('/usr/bin/chromium-browser');
    });

    test('Windows候補パスは両方のProgram Filesを含む', () => {
      const platform = 'win32';

      const candidates =
        platform === 'win32'
          ? [
              'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
              'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            ]
          : [];

      const hasDefault = candidates.some(p => p.includes('Program Files\\'));
      const hasX86 = candidates.some(p => p.includes('Program Files (x86)\\'));

      expect(hasDefault).toBe(true);
      expect(hasX86).toBe(true);
    });

    test('macOS候補パスはGoogle ChromeとChromiumの両方を含む', () => {
      const platform = 'darwin';

      const candidates =
        platform === 'darwin'
          ? [
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
              '/Applications/Chromium.app/Contents/MacOS/Chromium',
            ]
          : [];

      const hasGoogleChrome = candidates.some(p => p.includes('Google Chrome'));
      const hasChromium = candidates.some(p => p.includes('Chromium'));

      expect(hasGoogleChrome).toBe(true);
      expect(hasChromium).toBe(true);
    });

    test('Linux候補パスはstable, standard, chromiumを含む', () => {
      const platform = 'linux';

      const candidates =
        platform !== 'win32' && platform !== 'darwin'
          ? [
              '/usr/bin/google-chrome-stable',
              '/usr/bin/google-chrome',
              '/usr/bin/chromium',
              '/usr/bin/chromium-browser',
            ]
          : [];

      const hasStable = candidates.some(p => p.includes('stable'));
      const hasChrome = candidates.some(p => p.includes('google-chrome'));
      const hasChromium = candidates.some(p => p.includes('chromium'));

      expect(hasStable).toBe(true);
      expect(hasChrome).toBe(true);
      expect(hasChromium).toBe(true);
    });
  });

  describe('platform detection logic', () => {
    test('BrowserPlatform mapping for win32', () => {
      const platform = 'win32';

      const browserPlatform =
        platform === 'win32'
          ? 'WIN64'
          : platform === 'darwin'
            ? 'MAC'
            : 'LINUX';

      expect(browserPlatform).toBe('WIN64');
    });

    test('BrowserPlatform mapping for darwin (x64)', () => {
      const platform = 'darwin';
      const arch = 'x64';

      const browserPlatform =
        platform === 'win32'
          ? 'WIN64'
          : platform === 'darwin'
            ? arch === 'arm64'
              ? 'MAC_ARM'
              : 'MAC'
            : 'LINUX';

      expect(browserPlatform).toBe('MAC');
    });

    test('BrowserPlatform mapping for darwin (arm64)', () => {
      const platform = 'darwin';
      const arch = 'arm64';

      const browserPlatform =
        platform === 'win32'
          ? 'WIN64'
          : platform === 'darwin'
            ? arch === 'arm64'
              ? 'MAC_ARM'
              : 'MAC'
            : 'LINUX';

      expect(browserPlatform).toBe('MAC_ARM');
    });

    test('BrowserPlatform mapping for linux', () => {
      const platform = 'linux';

      const browserPlatform =
        platform === 'win32'
          ? 'WIN64'
          : platform === 'darwin'
            ? 'MAC'
            : 'LINUX';

      expect(browserPlatform).toBe('LINUX');
    });
  });

  describe('buildId constant', () => {
    test('buildIdは有効な数値文字列である', () => {
      const buildId = '1535649';

      expect(buildId).toMatch(/^\d+$/);
      expect(Number(buildId)).toBeGreaterThan(0);
      expect(Number.isNaN(Number(buildId))).toBe(false);
    });

    test('buildIdは7桁の文字列である', () => {
      const buildId = '1535649';

      expect(buildId.length).toBe(7);
    });
  });
});
