import { defineConfig } from "vitest/config";
// firestore.rules のテスト(Firebase Emulator が必要: npm run test:emu)
export default defineConfig({
  test: { include: ["tests/rules/**/*.test.ts"], environment: "node", testTimeout: 20000, hookTimeout: 30000, fileParallelism: false },
});
