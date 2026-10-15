import { expect, test } from "@playwright/test";
import { addTask } from "./helpers";

const row = (page: import("@playwright/test").Page, t: string) => page.locator(".list .item").filter({ has: page.locator(".title", { hasText: new RegExp(`^${t}$`) }) });

const titles = (page: import("@playwright/test").Page) => page.locator(".list .item:not(.done) .title").allTextContents();

test.describe("並べ替え(ローカルモード)", () => {
  test("つかんでドラッグ→新しい順がリロード後も残る→期限順に戻す", async ({ page }) => {
    await page.goto("./");
    await addTask(page, "いち", "2026-12-01");
    await addTask(page, "に", "2026-12-02");
    await addTask(page, "さん", "2026-12-03");
    expect(await titles(page)).toEqual(["いち", "に", "さん"]);
    await expect(page.locator("[data-order-reset]")).toHaveCount(0); // 手動順がないうちは出さない

    // 「いち」を最後まで引っぱる(マウスの Pointer Events)
    const grip = row(page, "いち").locator(".grip");
    const g = (await grip.boundingBox())!;
    const last = (await row(page, "さん").boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 20, { steps: 4 });
    await page.mouse.move(g.x + g.width / 2, last.y + last.height - 4, { steps: 10 });
    await expect(page.locator(".item.dragging")).toHaveCount(1);
    await expect(page.locator(".dropline")).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator(".item.dragging")).toHaveCount(0);
    await expect.poll(() => titles(page)).toEqual(["に", "さん", "いち"]);

    await page.reload();
    expect(await titles(page)).toEqual(["に", "さん", "いち"]);

    // 一覧の文字は選択できる(ハンドル以外は user-select: none にしない)
    expect(await page.locator(".item .title").first().evaluate((el) => getComputedStyle(el).userSelect)).not.toBe("none");

    await page.locator("[data-order-reset]").click();
    await expect.poll(() => titles(page)).toEqual(["いち", "に", "さん"]);
    await expect(page.locator("[data-order-reset]")).toHaveCount(0);
  });

  test("キーボード: ハンドルで ↑↓ 、完了にしても動作は壊れない", async ({ page }) => {
    await page.goto("./");
    await addTask(page, "あ", "2026-12-01");
    await addTask(page, "い", "2026-12-02");
    await addTask(page, "う", "2026-12-03");
    await page.waitForTimeout(600); // 追加シートが閉じ終わって、フォーカスが「＋」に戻るのを待つ
    const grip = row(page, "あ").locator(".grip");
    await expect(grip).toHaveAttribute("aria-label", /並べ替える/);
    await grip.focus();
    await page.keyboard.press("ArrowDown");
    expect(await titles(page)).toEqual(["い", "あ", "う"]);
    await expect(row(page, "あ").locator(".grip")).toBeFocused(); // 動かしても、つかみにフォーカスが残る
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // 末尾では動かない
    expect(await titles(page)).toEqual(["い", "う", "あ"]);

    // チェック→完了グループへ。未完了の並びは維持
    await row(page, "う").locator("input[type=checkbox]").check();
    await expect(page.locator(".item.done")).toHaveCount(1);
    expect(await titles(page)).toEqual(["い", "あ"]);
  });
});
