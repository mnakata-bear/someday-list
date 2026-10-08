// GitHub Pages 用の成果物を 1 つにまとめる。
//   <OUT_DIR>/            … 入口ページ(vite.entrance.config.ts)
//   <OUT_DIR>/app-<slug>/ … アプリ本体(vite.config.ts、BASE_PATH=/someday-list/app-<slug>/)
// slug は環境変数 APP_SLUG、なければ APP_PASSPHRASE から計算する。slug や合言葉は表示しない。
//   OUT_DIR(既定 dist) / APP_MODE(既定 production。テストでは e2e = ローカルモード)
import { resolve, join } from "node:path";
import { build } from "vite";
import { slugFor } from "./slug.mjs";

const slug = process.env.APP_SLUG || (process.env.APP_PASSPHRASE?.trim() ? slugFor(process.env.APP_PASSPHRASE) : "");
if (!/^[0-9a-f]{24}$/.test(slug)) {
  console.error("APP_SLUG(24桁の16進)か APP_PASSPHRASE を環境変数で渡してください");
  process.exit(1);
}
const out = resolve(process.env.OUT_DIR || "dist");
const mode = process.env.APP_MODE || "production";
const site = process.env.ENTRANCE_BASE || "/someday-list/";

console.log("入口ページをビルドします");
await build({ configFile: resolve("vite.entrance.config.ts"), mode, logLevel: "warn", base: site, build: { outDir: out, emptyOutDir: true } });

console.log("アプリ本体をビルドします");
process.env.BASE_PATH = `${site}app-${slug}/`;
await build({ configFile: resolve("vite.config.ts"), mode, logLevel: "warn", build: { outDir: join(out, `app-${slug}`), emptyOutDir: true } });
console.log("できました");
