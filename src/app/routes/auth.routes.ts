import { Hono } from 'hono';
import { loadCookies, clearCookies, isValidSession, saveCookies } from '../../features/auth/session/vault.store';
import { oauthLoginAndGetCookies } from '../../features/auth/puppeteer/oauth-login';
import type { Cookie } from 'puppeteer';

export const authRoutes = new Hono();

// 状態確認
authRoutes.get('/status', async (c) => {
  const v = await loadCookies();
  if (!v) return c.json({ state: 'NO_COOKIE' });
  const ok = await isValidSession(v);
  return c.json({ state: ok ? 'VALID' : 'EXPIRED' });
});

// ログイン開始（UIから押す）— 初回はheadfulで
authRoutes.post('/start', async (c) => {
  queueMicrotask(async () => {
    const cookies = await oauthLoginAndGetCookies({ headless: false });
    await saveCookies(cookies);
  });
  return c.json({ ok: true }); // 非同期で進める
});

// 手動クッキー登録（バックアップ用）
authRoutes.post('/cookie', async (c) => {
  const raw = await c.req.text(); // "name=value; name2=value2"
  const cookies = raw.split(';').map(s=>{
    const [name, value] = s.trim().split('=');
    return { name, value, domain: '.calil.jp', path: '/', expires: 0, httpOnly: false, secure: true } as Cookie;
  });
  await saveCookies(cookies);
  return c.json({ ok: true });
});

// ログアウト
authRoutes.post('/logout', async (c) => {
  await clearCookies();
  return c.json({ ok: true });
});
