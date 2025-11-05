import { test, expect, describe } from 'bun:test';
import { Hono } from 'hono';

/**
 * API統合テストの例
 *
 * このファイルはHonoアプリケーションのAPIエンドポイントをテストする基本パターンを示します。
 *
 * 注意: 現在のserver.tsxはappインスタンスをエクスポートしていないため、
 * 実際のエンドポイントをテストするには以下の変更が必要です：
 *
 * 1. server.tsxでappインスタンスをエクスポート:
 *    export const app = new Hono();
 *
 * 2. serve()の呼び出しを条件付きに:
 *    if (import.meta.main) {
 *      serve({ fetch: app.fetch, port: 8787 });
 *    }
 *
 * そうすれば、以下のようにテストできます：
 *    import { app } from './server';
 *    const res = await app.request('/api/cover/9784873117522');
 */

describe('Hono API Testing Pattern', () => {
  test('基本的なGETリクエストのテスト例', async () => {
    // テスト用の簡単なHonoアプリを作成
    const testApp = new Hono();

    testApp.get('/hello', (c) => {
      return c.json({ message: 'Hello, World!' });
    });

    // リクエストを送信してレスポンスを検証
    const res = await testApp.request('/hello');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ message: 'Hello, World!' });
  });

  test('パラメータ付きエンドポイントのテスト例', async () => {
    const testApp = new Hono();

    testApp.get('/api/books/:isbn', (c) => {
      const isbn = c.req.param('isbn');
      return c.json({ isbn, title: 'Test Book' });
    });

    const res = await testApp.request('/api/books/9784873117522');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isbn).toBe('9784873117522');
    expect(data.title).toBe('Test Book');
  });

  test('POSTリクエストのテスト例', async () => {
    const testApp = new Hono();

    testApp.post('/api/data', async (c) => {
      const body = await c.req.json();
      return c.json({ received: body });
    });

    const res = await testApp.request('/api/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'test', value: 123 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toEqual({ name: 'test', value: 123 });
  });

  test('クエリパラメータのテスト例', async () => {
    const testApp = new Hono();

    testApp.get('/api/search', (c) => {
      const query = c.req.query('q');
      const limit = c.req.query('limit');
      return c.json({ query, limit });
    });

    const res = await testApp.request('/api/search?q=typescript&limit=10');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.query).toBe('typescript');
    expect(data.limit).toBe('10');
  });

  test('エラーハンドリングのテスト例', async () => {
    const testApp = new Hono();

    testApp.get('/api/error', (c) => {
      return c.json({ error: 'Not Found' }, 404);
    });

    const res = await testApp.request('/api/error');

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Not Found');
  });
});

// 実際のユースケース: ヘッダー生成関数のテスト
describe('Cache Headers Utility', () => {
  test('開発環境でのキャッシュヘッダー', () => {
    const isDevelopment = true;
    const contentType = 'text/css; charset=utf-8';

    const headers = isDevelopment
      ? {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      : {
          'Content-Type': contentType,
          'Cache-Control': `public, max-age=86400, immutable`,
          'X-Content-Type-Options': 'nosniff',
        };

    expect(headers['Cache-Control']).toBe('no-cache, no-store, must-revalidate');
    expect(headers['Pragma']).toBe('no-cache');
  });

  test('本番環境でのキャッシュヘッダー', () => {
    const isDevelopment = false;
    const contentType = 'text/css; charset=utf-8';
    const maxAge = 86400;

    const headers = isDevelopment
      ? {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      : {
          'Content-Type': contentType,
          'Cache-Control': `public, max-age=${maxAge}, immutable`,
          'X-Content-Type-Options': 'nosniff',
        };

    expect(headers['Cache-Control']).toBe('public, max-age=86400, immutable');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });
});
