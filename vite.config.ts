import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages(https://mnakata-bear.github.io/someday-list/)向けに、ビルド時の既定 base は /someday-list/
// 変えたいときは環境変数 BASE_PATH(例: BASE_PATH=/ npm run build)で指定する
// 本番(GitHub Actions)は scripts/build-pages.mjs が BASE_PATH=/someday-list/app-<slug>/ にしてビルドする
export default defineConfig(({ command, mode, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = process.env.BASE_PATH || env.BASE_PATH || (command === "build" || isPreview ? "/someday-list/" : "/");
  return {
    base,
    build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 900 },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/app-icon.webp"],
        manifest: {
          name: "いつかやること",
          short_name: "いつかやること",
          description: "期限はあってもなくてもいい、「いつかやりたいこと」を書きためるリスト",
          lang: "ja",
          // 公開時は /someday-list/app-<slug>/(入口ページの下)。ホーム画面に追加するとここから直接ひらく
          start_url: base,
          scope: base,
          display: "standalone",
          orientation: "any",
          background_color: "#f2f8fe",
          theme_color: "#3f7fd6",
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,webp,svg,ico,webmanifest}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/__\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts-css" },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: { cacheName: "google-fonts", expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
            },
          ],
        },
      }),
    ],
  };
});
