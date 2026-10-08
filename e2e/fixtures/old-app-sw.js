// テスト専用: 以前ルート(/someday-list/)に登録されていた「アプリの SW」の代わり。何もしない。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
