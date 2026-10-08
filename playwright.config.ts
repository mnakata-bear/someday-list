import { defineConfig, devices } from "@playwright/test";

// ローカルモード(Firebase 未設定)のビルドで E2E。本番の Firebase には一切つながない。
const PORT = 4173;
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["**/emulator.spec.ts", "**/gate.spec.ts"],
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}/someday-list/`,
    serviceWorkers: "block",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `npx vite build --mode e2e --outDir dist-e2e && npx vite preview --mode e2e --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/someday-list/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
