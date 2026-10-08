import { expect, test, type Page } from "@playwright/test";
import { GATE_KEY, slugFor } from "../src/core/gate-slug";
import { GATE_TEST_PASSPHRASE } from "../playwright.gate.config";

// 入口ページ(表紙+合言葉)。テスト用のダミー合言葉で組み立てた dist-gate-e2e を使う。
let slug = "";
test.beforeAll(async () => { slug = await slugFor(GATE_TEST_PASSPHRASE); });

const appPath = () => `/someday-list/app-${slug}/`;
const saved = (page: Page) => page.evaluate((k) => localStorage.getItem(k), GATE_KEY);

async function openPass(page: Page) {
  await page.goto("./");
  await page.getByTestId("start").click();
  await expect(page.getByTestId("pass")).toBeVisible();
}

test.describe("入口ページ", () => {
  test("表紙: アイコン・タイトル・ひとこと・はじめる、noindex", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator(".mark img")).toBeVisible();
    await expect(page.locator("h1")).toHaveText("いつかやること");
    await expect(page.locator(".lead")).toContainText("いつかやりたいこと");
    await expect(page.getByTestId("start")).toBeVisible();
    await expect(page.getByTestId("pass")).toBeHidden();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // 入口に Firebase などアプリの中身を含めない
    const scripts = await page.evaluate(() => [...document.scripts].map((s) => s.src));
    for (const src of scripts) {
      const body = await (await page.request.get(src)).text();
      expect(body).not.toContain("firebase");
      expect(body).not.toContain(slug);
    }
  });

  test("はじめる → 合言葉欄(password・表示切替)", async ({ page }) => {
    await openPass(page);
    const pw = page.locator("#pw");
    await expect(pw).toBeFocused();
    await expect(pw).toHaveAttribute("type", "password");
    await page.locator("#eye").click();
    await expect(pw).toHaveAttribute("type", "text");
    await page.locator("#eye").click();
    await expect(pw).toHaveAttribute("type", "password");
  });

  test("間違った合言葉 → 「合言葉が違います」で移動しない", async ({ page }) => {
    await openPass(page);
    await page.locator("#pw").fill("chigau-aikotoba");
    await page.getByTestId("go").click();
    await expect(page.getByTestId("msg")).toHaveText("合言葉が違います");
    await expect(page.locator("#field")).toHaveClass(/shake/);
    expect(new URL(page.url()).pathname).toBe("/someday-list/");
    expect(await saved(page)).toBeNull();
    // 空のときも移動しない
    await page.locator("#pw").fill("");
    await page.getByTestId("go").click();
    await expect(page.getByTestId("msg")).toHaveText("合言葉を入力してください");
    expect(new URL(page.url()).pathname).toBe("/someday-list/");
  });

  test("正しい合言葉(Enter)→ アプリへ。次からは聞かずに自動でアプリへ", async ({ page }) => {
    await openPass(page);
    await page.locator("#pw").fill(GATE_TEST_PASSPHRASE);
    await page.locator("#pw").press("Enter");
    await page.waitForURL(`**${appPath()}`);
    await expect(page.getByTestId("sync")).toHaveText("ローカルモード(同期オフ)");
    expect(await saved(page)).toBe(slug);

    // アプリの manifest の scope / start_url は app-<slug>/
    const manifest = await page.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]')?.getAttribute("href");
      return href ? (await fetch(href)).json() : null;
    });
    expect(manifest.scope).toBe(appPath());
    expect(manifest.start_url).toBe(appPath());

    // 2回目の訪問
    await page.goto("./");
    await page.waitForURL(`**${appPath()}`);
    await expect(page.getByTestId("sync")).toBeVisible();
  });

  test("覚えている slug が 404(合言葉の変更後など)→ 記憶を消して入口に戻る", async ({ page }) => {
    await page.goto("./");
    await page.evaluate((k) => localStorage.setItem(k, "0123456789abcdef01234567"), GATE_KEY);
    await page.goto("./");
    await expect(page.getByTestId("start")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/someday-list/");
    expect(await saved(page)).toBeNull();
  });

  test("アプリの設定「この端末の合言葉の記憶を消す」", async ({ page }) => {
    await page.goto("./");
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [GATE_KEY, slug]);
    await page.goto("./");
    await page.waitForURL(`**${appPath()}`);
    await page.locator('[data-act="settings"]').first().click();
    const btn = page.locator("[data-forget-gate]");
    await expect(btn).toHaveText("この端末の合言葉の記憶を消す");
    await btn.click();
    await expect(page.locator(".toast")).toContainText("合言葉の記憶を消しました");
    await expect(btn).toBeDisabled();
    expect(await saved(page)).toBeNull();
    // 入口に戻ると、また聞かれる
    await page.goto("/someday-list/");
    await expect(page.getByTestId("start")).toBeVisible();
  });

  test("375px で横スクロールなし(表紙・合言葉・エラー表示)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.goto("./");
    expect(await noScroll()).toBe(true);
    await page.getByTestId("start").click();
    await page.locator("#pw").fill("x");
    await page.getByTestId("go").click();
    await expect(page.getByTestId("msg")).toBeVisible();
    expect(await noScroll()).toBe(true);
  });
});

test.describe("旧 Service Worker の解除", () => {
  test.use({ serviceWorkers: "allow" });

  test("入口ページが、ルートのスコープに残った旧 SW と旧キャッシュを解除する", async ({ page }) => {
    await page.goto("./");
    const root = new URL("/someday-list/", page.url()).href;
    await page.evaluate(async (root) => {
      const reg = await navigator.serviceWorker.register("old-app-sw.js", { scope: "./" });
      await new Promise<void>((res) => {
        const w = reg.installing ?? reg.waiting ?? reg.active!;
        if (w.state === "activated") return res();
        w.addEventListener("statechange", () => { if (w.state === "activated") res(); });
      });
      await (await caches.open(`workbox-precache-v2-${root}`)).put("dummy", new Response("old"));
    }, root);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);

    await page.reload();
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("workbox-precache")).length)).toBe(0);
    await expect(page.getByTestId("start")).toBeVisible();
  });

  test("旧 SW と同じ名前の sw.js は、自分で古いキャッシュを消して登録を解除する", async ({ page }) => {
    // 入口ページの解除処理が動かないページ(robots.txt)から登録して、sw.js 単体のふるまいを見る
    await page.goto("robots.txt");
    const root = new URL("/someday-list/", page.url()).href;
    await page.evaluate(async (root) => {
      await (await caches.open(`workbox-precache-v2-${root}`)).put("dummy", new Response("old"));
      await (await caches.open("other-project-cache")).put("dummy", new Response("keep"));
      await navigator.serviceWorker.register("sw.js", { scope: "./" });
    }, root);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 15_000 }).toBe(0);
    const keys = await page.evaluate(() => caches.keys());
    expect(keys).not.toContain(`workbox-precache-v2-${root}`);
    expect(keys).toContain("other-project-cache"); // 同じオリジンの、ほかのキャッシュは消さない
  });
});
