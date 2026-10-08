import { expect, test, type Browser, type Page } from "@playwright/test";
import { addTask, item } from "./helpers";

// Firebase Emulator(demo-someday)を使った同期とログインの壁のテスト。本番の Firebase には接続しない。
const PROJECT = "demo-someday";
const ALLOWED = "naka.mutora3@gmail.com";

/** エミュレーターのアカウント / Firestore を空にする(テスト同士が干渉しないように) */
async function clearAuth() {
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}
async function clearFirestore() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}
test.beforeEach(async () => { await clearAuth(); await clearFirestore(); });

/** アプリ画面の部品(一覧・追加フォーム・スタンプカード・設定ボタン)が DOM に一切無いこと */
async function expectNoApp(page: Page) {
  await expect(page.locator('[data-r="list"], .list, form[data-form="add"], [data-testid="scard"], [data-act="settings"], [data-testid="sync"]')).toHaveCount(0);
}

/** 読み込み開始から、アプリ画面の部品が一瞬でも DOM に出たかを記録する */
async function watchAppFlash(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __appSeen: boolean };
    w.__appSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('form[data-form="add"], [data-r="list"], [data-testid="scard"]')) w.__appSeen = true;
    }).observe(document, { childList: true, subtree: true });
  });
}
const appSeen = (page: Page) => page.evaluate(() => (window as unknown as { __appSeen: boolean }).__appSeen);

async function open(browser: Browser, sub?: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("./");
  await expect(page.locator('[data-testid="gate"] [data-act="login"]')).toBeVisible({ timeout: 20_000 });
  if (sub) await signIn(page, sub);
  return page;
}
async function testSignIn(page: Page, sub: string, email = ALLOWED, verified = true) {
  await page.waitForFunction(() => !!(window as unknown as { __someday?: unknown }).__someday);
  await page.evaluate(([s, e, v]) => (window as unknown as { __someday: { testSignIn(s: string, e: string, v: boolean): Promise<void> } }).__someday.testSignIn(s as string, e as string, v as boolean), [sub, email, verified] as const);
}
async function signIn(page: Page, sub: string) {
  await testSignIn(page, sub);
  await expect(page.getByTestId("sync")).toHaveText("同期済み", { timeout: 20_000 });
}

test("未ログインでは、ログイン画面だけが出る(アプリ画面は一瞬も描画しない)", async ({ page }) => {
  await watchAppFlash(page);
  await page.goto("./");
  const gate = page.getByTestId("gate");
  await expect(gate.locator('[data-act="login"]')).toHaveText("Googleでログイン", { timeout: 20_000 });
  await expect(gate.locator("h1")).toHaveText("いつかやること");
  await expect(gate.locator(".gate-icon img")).toBeVisible();
  await expect(page.getByTestId("gate-msg")).toBeHidden();
  await expectNoApp(page);
  expect(await appSeen(page)).toBe(false);
  // 文字は選択できる
  expect(await gate.locator("h1").evaluate((el) => getComputedStyle(el).userSelect)).not.toBe("none");
});

test("許可アカウントでログインすると、アプリ画面が出る", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator('[data-testid="gate"] [data-act="login"]')).toBeVisible({ timeout: 20_000 });
  await signIn(page, `allowed-${Date.now()}`);
  await expect(page.getByTestId("gate")).toHaveCount(0);
  await expect(page.locator('form[data-form="add"]')).toBeVisible();
  await expect(page.locator(".empty")).toBeVisible();
  await addTask(page, "許可アカウントのやること");
  await expect(item(page, "許可アカウントのやること")).toBeVisible();
  // 設定にアカウントが出て、ログアウトするとログイン画面に戻る
  await page.locator('[data-act="settings"]').click();
  await expect(page.locator("#settings .acct")).toContainText(ALLOWED);
  await page.locator("#settings [data-logout]").click();
  await expect(page.locator('[data-testid="gate"] [data-act="login"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#settings")).toBeHidden();
  await expectNoApp(page);
});

test("許可されていないアカウントは「このアカウントでは使えません」になり、アプリ画面は描画されない", async ({ page }) => {
  await watchAppFlash(page);
  await page.goto("./");
  await expect(page.locator('[data-testid="gate"] [data-act="login"]')).toBeVisible({ timeout: 20_000 });
  await testSignIn(page, `stranger-${Date.now()}`, "other@example.com");
  await expect(page.getByTestId("gate-msg")).toHaveText("このアカウントでは使えません", { timeout: 15_000 });
  await expect(page.getByTestId("gate")).not.toContainText(ALLOWED); // 許可アカウントは表示しない
  await expectNoApp(page);
  expect(await appSeen(page)).toBe(false);
  // すぐログアウトされているので、再読み込みしても未ログインのログイン画面
  await page.reload();
  await expect(page.locator('[data-testid="gate"] [data-act="login"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  await expectNoApp(page);
});

test("メール未確認(email_verified=false)の許可メールも使えない", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator('[data-testid="gate"] [data-act="login"]')).toBeVisible({ timeout: 20_000 });
  await testSignIn(page, `unverified-${Date.now()}`, ALLOWED, false);
  await expect(page.getByTestId("gate-msg")).toHaveText("このアカウントでは使えません", { timeout: 15_000 });
  await expectNoApp(page);
});

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
  await clearAuth(); // 同じ許可メールで、別の uid のアカウントを作る
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

test("ログイン前に端末に保存されていたやることを、ログイン時に取り込める", async ({ browser }) => {
  const a = await open(browser);
  // クラウド設定ありのビルドでは未ログインで書けないので、以前の版で端末に保存されたデータを置いておく
  await a.evaluate(() => localStorage.setItem("someday-tasks-v1", JSON.stringify({
    tasks: [{ id: "localone", title: "ログイン前のやること", due: "", note: "", done: false, doneAt: null, createdAt: 1, updatedAt: 1 }], stampTotal: 0,
  })));
  await a.reload();
  await expect(a.locator('[data-testid="gate"] [data-act="login"]')).toBeVisible({ timeout: 20_000 });
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
