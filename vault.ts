import fs from 'node:fs/promises';

const FILE = './.vault/calil.cookies.json';

export async function saveCookies(cookies: any[]) {
  await fs.mkdir('./.vault',{recursive:true});
  await fs.writeFile(FILE, JSON.stringify({ cookies, savedAt: Date.now() }));
}
export async function loadCookies(): Promise<{cookies:any[]}|null> {
  try { return JSON.parse(await fs.readFile(FILE,'utf8')); } catch { return null; }
}
export async function clearCookies() {
  try { await fs.unlink(FILE); } catch {}
}

export function toCookieHeader(v: {cookies:any[]}) {
  return v.cookies.map((c:any)=>`${c.name}=${c.value}`).join('; ');
}

export async function isValidSession(v: {cookies:any[]}) {
  const headers = { Cookie: toCookieHeader(v) };
  const res = await fetch('https://calil.jp/', { headers });
  return res.status === 200;
}
