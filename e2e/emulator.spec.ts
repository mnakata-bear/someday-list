import { expect, test, type Browser, type Page } from "@playwright/test";
import { addTask, item } from "./helpers";

// Firebase Emulator(demo-someday)を使った同期のテスト。本番の Firebase には接続しない。

async function open(browser: Browser, sub?: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("./");
  await expect(page.getByTestId("sync")).toHaveText("未ログイン(この端末のみ)", { timeout: 20_000 });
  if (sub) await signIn(page, sub);
  return page;
}
async function signIn(page: Page, sub: string) {
  await page.waitForFunction(() => !!(window as unknown as { __someday?: unknown }).__someday);
  await page.evaluate((s) => (window as unknown as { __someday: { testSignIn(s: string): Promise<void> } }).__someday.testSignIn(s), sub);
  await expect(page.getByTestId("sync")).toHaveText("同期済み", { timeout: 20_000 });
}

test("2つのブラウザ間でリアルタイムに同期され、他端末の変更はトーストとハイライトで知らせる", async ({ browser }) => {
  const sub = `sync-${Date.now()}`;
  const a = await open(browser, sub);
  const b = await open(browser, sub);
  await expect(a.locator(".empty")).toBeVisible();

  // A で追加 → B に届く
  await addTask(a, "京都で紅葉を見る", "2030-11-30");
  await expect(item(b, "京都で紅葉を見る")).toBeVisible({ timeout: 15_000 });
  await expect(b.locator(".toast")).toContainText("別の端末から追加されました");
  await expect(item(b, "京都で紅葉を見る")).toHaveClass(/flash/);
  await expect(item(a, "京都で紅葉を見る")).not.toHaveClass(/flash/); // 自分の操作ではハイライトしない

  // B でチェック → A にスタンプ、スタンプカードも同期
  await item(b, "京都").locator('input[type="checkbox"]').check();
  await expect(item(a, "京都")).toHaveClass(/done/, { timeout: 15_000 });
  await expect(item(a, "京都").locator(".stamp")).toBeVisible();
  await expect(a.locator(".toast")).toContainText("別の端末から同期 ・ 達成！");
  await expect(a.getByTestId("scard")).toHaveAttribute("data-total", "1");

  // A でメモを編集 → B に反映
  await item(a, "京都").locator("[data-edit]").click();
  await a.locator("#editor [data-note-edit]").click();
  await a.locator('#editor textarea[name="note"]').fill("https://example.com/kyoto");
  await a.locator('#editor button[type="submit"]').click();
  await expect(item(b, "京都").locator(".notex a")).toHaveText("https://example.com/kyoto", { timeout: 15_000 });

  // 設定(テーマ)も同期
  await a.locator('[data-act="settings"]').click();
  await a.locator('#settings [data-k="theme"][data-v="wine"]').click();
  await a.keyboard.press("Escape");
  await expect(b.locator("#app")).toHaveClass(/\bdk\b/, { timeout: 15_000 });

  // B で削除 → A から消える
  await item(b, "京都").locator("[data-edit]").click();
  await b.locator("#editor [data-del]").click();
  await expect(item(a, "京都")).toHaveCount(0, { timeout: 15_000 });

  // リロードしても(クラウドから)読み込める
  await addTask(a, "ピアノをもう一度はじめる");
  await b.reload();
  await expect(item(b, "ピアノ")).toBeVisible({ timeout: 15_000 });
});

test("別の uid のデータは見えない", async ({ browser }) => {
  const a = await open(browser, `owner-${Date.now()}`);
  await addTask(a, "ひみつのやること");
  await expect(a.getByTestId("sync")).toHaveText("同期済み", { timeout: 15_000 });
  const c = await open(browser, `other-${Date.now()}`);
  await expect(c.locator(".empty")).toBeVisible({ timeout: 15_000 });
  await expect(item(c, "ひみつ")).toHaveCount(0);
});

test("オフライン中も追加・チェックでき、復帰すると同期する", async ({ browser }) => {
  const sub = `offline-${Date.now()}`;
  const a = await open(browser, sub);
  const b = await open(browser, sub);
  await addTask(a, "オンラインで追加");
  await expect(item(b, "オンラインで追加")).toBeVisible({ timeout: 15_000 });

  await a.context().setOffline(true);
  await expect(a.getByTestId("sync")).toHaveText("オフライン・あとで同期します");
  await addTask(a, "オフラインで追加");
  await item(a, "オンラインで追加").locator('input[type="checkbox"]').check();
  await expect(item(a, "オフラインで追加")).toBeVisible();
  await expect(item(a, "オンラインで追加").locator(".stamp")).toBeVisible();
  await b.waitForTimeout(1500);
  await expect(item(b, "オフラインで追加")).toHaveCount(0);

  await a.context().setOffline(false);
  await expect(item(b, "オフラインで追加")).toBeVisible({ timeout: 30_000 });
  await expect(item(b, "オンラインで追加")).toHaveClass(/done/, { timeout: 30_000 });
  await expect(a.getByTestId("sync")).toHaveText("同期済み", { timeout: 30_000 });
});

test("ログイン前に端末で書いたやることを、ログイン時に取り込める", async ({ browser }) => {
  const a = await open(browser);
  await addTask(a, "ログイン前のやること");
  await signIn(a, `import-${Date.now()}`).catch(() => { /* 取り込み確認が先に出る */ });
  await expect(a.locator("#ask")).toBeVisible({ timeout: 15_000 });
  await expect(a.locator("#ask")).toContainText("1 件");
  await a.locator('#ask [data-a="1"]').click();
  await expect(item(a, "ログイン前のやること")).toBeVisible({ timeout: 15_000 });
  await expect(a.getByTestId("sync")).toHaveText("同期済み", { timeout: 15_000 });
  await a.reload();
  await expect(item(a, "ログイン前のやること")).toBeVisible({ timeout: 15_000 });
  expect(await a.evaluate(() => JSON.parse(localStorage.getItem("someday-tasks-v1") || "{}").tasks?.length ?? 0)).toBe(0);
});
