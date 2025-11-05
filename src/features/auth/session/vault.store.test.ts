import { test, expect, describe } from 'bun:test';
import { toCookieHeader } from './vault.store';
import type { Cookie } from 'puppeteer';

/**
 * vault.store.tsのテスト
 *
 * 注意: ファイルI/Oや外部API呼び出しを含む関数（saveCookies, loadCookies, isValidSession）は
 * モックが必要なため、ここでは純粋関数のみをテストします。
 */

describe('vault.store', () => {
  describe('toCookieHeader', () => {
    test('単一のクッキーを正しくフォーマットする', () => {
      const cookies: Cookie[] = [
        {
          name: 'session_id',
          value: 'abc123',
          domain: '.example.com',
          path: '/',
          expires: 1234567890,
          size: 16,
          httpOnly: true,
          secure: true,
          session: false,
        },
      ];

      const result = toCookieHeader({ cookies });

      expect(result).toBe('session_id=abc123');
    });

    test('複数のクッキーをセミコロンで区切る', () => {
      const cookies: Cookie[] = [
        {
          name: 'cookie1',
          value: 'value1',
          domain: '.example.com',
          path: '/',
          expires: 1234567890,
          size: 14,
          httpOnly: false,
          secure: false,
          session: false,
        },
        {
          name: 'cookie2',
          value: 'value2',
          domain: '.example.com',
          path: '/',
          expires: 1234567890,
          size: 14,
          httpOnly: false,
          secure: false,
          session: false,
        },
      ];

      const result = toCookieHeader({ cookies });

      expect(result).toBe('cookie1=value1; cookie2=value2');
    });

    test('3つ以上のクッキーを正しくフォーマットする', () => {
      const cookies: Cookie[] = [
        {
          name: 'auth',
          value: 'token123',
          domain: '.example.com',
          path: '/',
          expires: 1234567890,
          size: 12,
          httpOnly: true,
          secure: true,
          session: false,
        },
        {
          name: 'user',
          value: 'john',
          domain: '.example.com',
          path: '/',
          expires: 1234567890,
          size: 9,
          httpOnly: false,
          secure: false,
          session: false,
        },
        {
          name: 'lang',
          value: 'en',
          domain: '.example.com',
          path: '/',
          expires: 1234567890,
          size: 7,
          httpOnly: false,
          secure: false,
          session: false,
        },
      ];

      const result = toCookieHeader({ cookies });

      expect(result).toBe('auth=token123; user=john; lang=en');
    });

    test('空のクッキー配列は空文字列を返す', () => {
      const cookies: Cookie[] = [];

      const result = toCookieHeader({ cookies });

      expect(result).toBe('');
    });

    test('特殊文字を含むクッキー値を正しく処理する', () => {
      const cookies: Cookie[] = [
        {
          name: 'data',
          value: 'hello%20world',
          domain: '.example.com',
          path: '/',
          expires: 1234567890,
          size: 15,
          httpOnly: false,
          secure: false,
          session: false,
        },
      ];

      const result = toCookieHeader({ cookies });

      expect(result).toBe('data=hello%20world');
    });

    test('長い値を持つクッキーを処理できる', () => {
      const longValue = 'a'.repeat(1000);
      const cookies: Cookie[] = [
        {
          name: 'longCookie',
          value: longValue,
          domain: '.example.com',
          path: '/',
          expires: 1234567890,
          size: 1010,
          httpOnly: false,
          secure: false,
          session: false,
        },
      ];

      const result = toCookieHeader({ cookies });

      expect(result).toBe(`longCookie=${longValue}`);
      expect(result.length).toBe(1011); // 'longCookie=' (11) + longValue (1000)
    });

    test('クッキー名に特殊文字がない場合は正しく処理する', () => {
      const cookies: Cookie[] = [
        {
          name: 'my_cookie_123',
          value: 'value',
          domain: '.example.com',
          path: '/',
          expires: 1234567890,
          size: 18,
          httpOnly: false,
          secure: false,
          session: false,
        },
      ];

      const result = toCookieHeader({ cookies });

      expect(result).toBe('my_cookie_123=value');
    });
  });
});
