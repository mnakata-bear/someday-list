// GitHub Pages に近いふるまいの小さな静的サーバー(入口ページの E2E 用)。
//   /someday-list/... → <dir>/...、フォルダは index.html、無ければ 404(SPA のような index.html 返しはしない)
//   使い方: node scripts/serve-pages.mjs <dir> <port> [追加で探すフォルダ]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const [dirArg = "dist", portArg = "4175", extraArg] = process.argv.slice(2);
const PREFIX = "/someday-list/";
const roots = [resolve(dirArg), ...(extraArg ? [resolve(extraArg)] : [])];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

async function find(rel) {
  for (const root of roots) {
    const p = normalize(join(root, rel));
    if (p !== root && !p.startsWith(root + sep)) continue;
    try {
      const s = await stat(p);
      if (s.isFile()) return { path: p };
      if (s.isDirectory()) {
        if (!rel.endsWith("/") && rel !== "") return { redirect: true };
        const idx = join(p, "index.html");
        if ((await stat(idx).catch(() => null))?.isFile()) return { path: idx };
      }
    } catch { /* 次のルートへ */ }
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const head = req.method === "HEAD";
  if (req.method !== "GET" && !head) { res.writeHead(405).end(); return; }
  if (!url.pathname.startsWith(PREFIX)) {
    if (url.pathname === PREFIX.slice(0, -1)) { res.writeHead(301, { Location: PREFIX }).end(); return; }
    res.writeHead(404, { "Content-Type": "text/plain" }).end(head ? undefined : "404"); return;
  }
  const rel = decodeURIComponent(url.pathname.slice(PREFIX.length));
  const hit = await find(rel);
  if (hit?.redirect) { res.writeHead(301, { Location: url.pathname + "/" }).end(); return; }
  if (!hit) { res.writeHead(404, { "Content-Type": "text/plain" }).end(head ? undefined : "404 Not Found"); return; }
  const body = await readFile(hit.path);
  res.writeHead(200, { "Content-Type": TYPES[extname(hit.path)] ?? "application/octet-stream", "Content-Length": body.length, "Cache-Control": "no-cache" });
  res.end(head ? undefined : body);
}).listen(Number(portArg), "127.0.0.1", () => console.log(`serve-pages: http://127.0.0.1:${portArg}${PREFIX}`));
