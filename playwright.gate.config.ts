import { defineConfig, devices } from "@playwright/test";

// 入口ページ(表紙+合言葉)の E2E。
// テスト用のダミー合言葉で dist-gate-e2e を組み立て(入口=直下、アプリ=app-<slug>/、アプリはローカルモード)、
// GitHub Pages に近い静的サーバー(scripts/serve-pages.mjs)で配信する。本番の合言葉は使わない。
export const GATE_TEST_PASSPHRASE = "dummy-pass-for-tests";
const PORT = 4175;
export default defineConfig({
  testDir: "e2e",
  testMatch: ["**/gate.spec.ts"],
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/someday-list/`,
    serviceWorkers: "block",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  projects: [{ name: "chromium-gate", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `node scripts/build-pages.mjs && node scripts/serve-pages.mjs dist-gate-e2e ${PORT} e2e/fixtures`,
    env: { APP_PASSPHRASE: GATE_TEST_PASSPHRASE, OUT_DIR: "dist-gate-e2e", APP_MODE: "e2e" },
    url: `http://127.0.0.1:${PORT}/someday-list/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
