import { expect, test } from "@playwright/test";
import { addTask, item, openAdder } from "./helpers";

const dlg = (page: import("@playwright/test").Page) => page.locator("#adder");

test.describe("追加シート(「＋」ボタン)", () => {
  test("初期は追加フォームが見えない。「＋」で開き、入力欄に自動フォーカス", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("#fab")).toBeVisible();
    await expect(page.locator("#fab")).toHaveAttribute("aria-label", "やることを追加");
    await expect(page.locator('form[data-form="add"]')).toBeHidden();
    await page.locator("#fab").click();
    await expect(dlg(page)).toBeVisible();
    await expect(dlg(page)).toHaveAttribute("aria-modal", "true");
    await expect(dlg(page)).toHaveAttribute("aria-label", "やることを追加");
    await expect(page.locator('input[name="t"]')).toBeFocused();
  });

  test("追加後も開いたまま連続追加でき、「追加しました」は1.2秒ほどで消える", async ({ page }) => {
    await page.goto("./");
    await addTask(page, "ひとつめ", "", true);
    await expect(dlg(page)).toBeVisible();
    await expect(page.getByTestId("added")).toHaveText("追加しました");
    await expect(page.locator('input[name="t"]')).toHaveValue("");
    await expect(page.locator('input[name="t"]')).toBeFocused();
    await addTask(page, "ふたつめ", "", true);
    await expect(page.locator(".list .item")).toHaveCount(2);
    await expect(page.getByTestId("added")).toHaveText("", { timeout: 3000 });
  });

  test("Esc・暗幕・×で閉じ、FABにフォーカスが戻る", async ({ page }) => {
    await page.goto("./");
    await openAdder(page);
    await page.keyboard.press("Escape");
    await expect(dlg(page)).toBeHidden();
    await expect(page.locator("#fab")).toBeFocused();

    await openAdder(page);
    await page.mouse.click(4, 4); // 暗幕
    await expect(dlg(page)).toBeHidden();
    await expect(page.locator("#fab")).toBeFocused();

    await openAdder(page);
    const x = dlg(page).locator("[data-close]");
    const b = await x.boundingBox();
    expect(b!.width).toBeGreaterThanOrEqual(44);
    expect(b!.height).toBeGreaterThanOrEqual(44);
    await x.click();
    await expect(dlg(page)).toBeHidden();
    await expect(page.locator("#fab")).toBeFocused();
  });

  test("フォーカスが外へ出ない(Tabでシート内を巡回)", async ({ page }) => {
    await page.goto("./");
    await openAdder(page);
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("#adder"))).toBe(true);
    }
  });

  test("追加後の「メモを書く」は、シートを閉じても押せる", async ({ page }) => {
    await page.goto("./");
    await addTask(page, "京都で紅葉を見る");
    await page.locator(".toast .tact", { hasText: "メモを書く" }).click();
    await expect(page.locator("#editor")).toBeVisible();
  });

  test("空状態に「＋ やることを追加」の案内があり、押すと同じシートが開く", async ({ page }) => {
    await page.goto("./");
    const cta = page.locator(".empty .addcta");
    await expect(cta).toHaveText("＋ やることを追加");
    await cta.click();
    await expect(dlg(page)).toBeVisible();
    await expect(page.locator('input[name="t"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#fab")).toBeFocused();
    await addTask(page, "ひとつ");
    await expect(page.locator(".empty .addcta")).toHaveCount(0);
  });

  test("375px: 横スクロールなし・シートは下に収まる・一覧の下に余白", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("./");
    for (let i = 0; i < 10; i++) await addTask(page, `やること ${i}`);
    await openAdder(page);
    const b = await dlg(page).boundingBox();
    expect(b!.width).toBeLessThanOrEqual(375);
    expect(Math.round(b!.y + b!.height)).toBe(812);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.keyboard.press("Escape");
    // 一番下までスクロールすると、最後の項目が FAB と重ならない
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const last = await page.locator(".list .item").last().boundingBox();
    const fab = await page.locator("#fab").boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(fab!.y);
  });

  test("PC: 中央のモーダル、Cレイアウトでも右下に「＋」", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./");
    await openAdder(page);
    const b = await dlg(page).boundingBox();
    expect(Math.abs(b!.x + b!.width / 2 - 640)).toBeLessThan(2);
    expect(b!.y + b!.height).toBeLessThan(800);
    await page.keyboard.press("Escape");
    await page.locator('[data-act="settings"]').click();
    await page.locator('#settings [data-k="layout"][data-v="c"]').click();
    await page.keyboard.press("Escape");
    const f = await page.locator("#fab").boundingBox();
    expect(f!.x + f!.width).toBeLessThanOrEqual(1280);
    expect(f!.y + f!.height).toBeLessThanOrEqual(800);
    await addTask(page, "Cで追加");
    await expect(item(page, "Cで追加")).toBeVisible();
  });

  test("文字は選択できる(user-select:none なし)", async ({ page }) => {
    await page.goto("./");
    await openAdder(page);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("#adder h2")!).userSelect)).not.toBe("none");
  });
});
