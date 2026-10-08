import { defineConfig, devices } from "@playwright/test";

// Firebase Emulator(auth:9099 / firestore:8080)を使う E2E。
// 単体では動かさず、npm run test:emu(firebase emulators:exec の中)から実行する。
const PORT = 4174;
export default defineConfig({
  testDir: "e2e",
  testMatch: ["**/emulator.spec.ts"],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/someday-list/`,
    serviceWorkers: "block",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  projects: [{ name: "chromium-emulator", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `npx vite build --mode emulator --outDir dist-emu && npx vite preview --mode emulator --outDir dist-emu --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/someday-list/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
