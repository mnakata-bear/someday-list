/*
 * 自己解除 Service Worker。
 * 以前このスコープ(/someday-list/)に、アプリ本体の SW(vite-plugin-pwa の sw.js)が登録されていた。
 * ブラウザが sw.js の更新を取りに来たときにこのファイルが入り、
 *   古いキャッシュを消す → 自分の登録を解除する → 開いているページを読み込み直す
 * ことで、古いアプリがルートで表示され続けるのを止める。
 * (キャッシュはオリジン mnakata-bear.github.io 全体で共有なので、このアプリの古い分だけを消す)
 */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const scope = self.registration.scope; // 例: https://mnakata-bear.github.io/someday-list/
    try {
      const keys = await caches.keys();
      const old = keys.filter((k) =>
        k.endsWith(scope) || // workbox-precache-v2-<scope> など、旧スコープのキャッシュ
        k === "google-fonts-css" || k === "google-fonts"); // 旧アプリの runtimeCaching(アプリ側で取り直される)
      await Promise.all(old.map((k) => caches.delete(k)));
    } catch (e) { /* noop */ }
    try { await self.registration.unregister(); } catch (e) { /* noop */ }
    try {
      const list = await self.clients.matchAll({ type: "window" });
      await Promise.all(list.map((c) => c.navigate(c.url).catch(() => undefined)));
    } catch (e) { /* noop */ }
  })());
});
