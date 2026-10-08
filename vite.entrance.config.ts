import { defineConfig } from "vite";

// 入口ページ(表紙+合言葉)だけのビルド。Firebase などアプリの依存は含めない。
//   npm run dev:gate → http://localhost:5174/someday-list/
// 本番は scripts/build-pages.mjs が dist 直下にこれを、dist/app-<slug>/ にアプリを出力する。
export default defineConfig({
  root: "entrance",
  base: process.env.ENTRANCE_BASE || "/someday-list/",
  publicDir: "public",
  appType: "mpa",
  build: { target: "es2022", sourcemap: false, outDir: "../dist-entrance", emptyOutDir: true },
  server: { port: 5174 },
});
