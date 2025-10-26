import { loadCookies, saveCookies, toCookieHeader, isValidSession } from './vault';
import { oauthLoginAndGetCookies } from './puppeteer-auth';

export async function ensureSession(): Promise<{cookies:any[]}> {
  let v = await loadCookies();
  if (v && await isValidSession(v)) return v;
  // 失効 or 未保存 → 再ログイン。2回目以降はたいてい無人で通過
  const cookies = await oauthLoginAndGetCookies({ headless: true });
  await saveCookies(cookies);
  return { cookies };
}

export async function fetchCalil(url: string) {
  let v = await loadCookies();
  if (!v) v = await ensureSession();

  let res = await fetch(url, { headers: { Cookie: toCookieHeader(v) }});
  if (res.status === 401 || res.status === 403) {
    v = await ensureSession();
    res = await fetch(url, { headers: { Cookie: toCookieHeader(v) }});
  }
  return res;
}
