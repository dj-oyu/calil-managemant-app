import fs from 'node:fs/promises';
import type { Cookie } from 'puppeteer';

const FILE = './.vault/calil.cookies.json';

export async function saveCookies(cookies: Cookie[]) {
  await fs.mkdir('./.vault',{recursive:true});
  await fs.writeFile(FILE, JSON.stringify({ cookies, savedAt: Date.now() }));
}
export async function loadCookies(): Promise<{cookies: Cookie[]}|null> {
  try { return JSON.parse(await fs.readFile(FILE,'utf8')); } catch { return null; }
}
export async function clearCookies() {
  try { await fs.unlink(FILE); } catch {}
}

export function toCookieHeader(v: {cookies: Cookie[]}) {
  return v.cookies.map((c: Cookie)=>`${c.name}=${c.value}`).join('; ');
}

export async function isValidSession(v: {cookies: Cookie[]}) {
  for (const c of v.cookies.sort((a,b)=>b.expires - a.expires)) {
    const headers = { Cookie: toCookieHeader(v) };
    const res = await fetch('https://calil.jp/', { headers });
    if (res.status === 200) {
      saveCookies([c]);
      return true;
    }
  }
  return false;
}
