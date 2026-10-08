import { expect, test } from "@playwright/test";
import { addTask, item } from "./helpers";

const btn = (p: import("@playwright/test").Page) => p.locator('[data-act="stamp"]');
const drawer = (p: import("@playwright/test").Page) => p.locator("#drawer");

test.describe("スタンプのドロワー", () => {
  test("PC: 枚数表示→開く→Esc/暗幕/×で閉じる→フォーカス復帰→完了で数字が増える", async ({ page }) => {
    await page.goto("./");
    await expect(btn(page)).toContainText("スタンプ 0/10");
    await expect(drawer(page)).toBeHidden();
    // 常時表示のスタンプカードは一覧の上にない
    await expect(page.locator(".pc-in").getByTestId("scard")).toHaveCount(0);
    const box = await btn(page).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);

    await btn(page).focus();
    await btn(page).click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page)).toHaveAttribute("role", "dialog");
    await expect(drawer(page)).toHaveAttribute("aria-modal", "true");
    await expect(drawer(page)).toHaveAttribute("aria-label", "スタンプカード");
    await expect(drawer(page).locator(".slot")).toHaveCount(10);
    await expect(drawer(page)).toContainText("GOAL");
    await expect(drawer(page)).toContainText("叶えたこと");
    await expect(drawer(page)).toContainText("0 / 0 達成");
    expect((await drawer(page).boundingBox())!.width).toBeCloseTo(380, 0);
    await expect(drawer(page).locator("[data-dr-close]")).toBeFocused();
    // フォーカスはドロワー内に留まる
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("#drawer"))).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    await expect(btn(page)).toBeFocused();

    await btn(page).click();
    await expect(drawer(page)).toBeVisible();
    await page.mouse.click(40, 400); // 暗幕(ドロワーの外)
    await expect(drawer(page)).toBeHidden();
    await expect(btn(page)).toBeFocused();

    await btn(page).click();
    await drawer(page).locator("[data-dr-close]").click();
    await expect(drawer(page)).toBeHidden();
    await expect(btn(page)).toBeFocused();

    // 完了で数字が増える(閉じたまま)
    await addTask(page, "ドロワーのテスト");
    await item(page, "ドロワー").locator('input[type="checkbox"]').check();
    await expect(btn(page)).toContainText("スタンプ 1/10");
    await expect(btn(page).locator(".sbn")).toHaveClass(/bump/);
    await expect(page.getByTestId("scard")).toHaveAttribute("data-total", "1");
  });

  test("開いたまま完了すると、新しい枠にスタンプが押される", async ({ page }) => {
    await page.goto("./");
    await addTask(page, "押すテスト");
    await btn(page).click();
    await expect(drawer(page)).toBeVisible();
    // 暗幕があるので、チェックは DOM から直接行う(開く前に完了する経路は別テストで確認済み)
    await page.keyboard.press("Escape");
    await item(page, "押すテスト").locator('input[type="checkbox"]').check();
    await btn(page).click();
    await expect(drawer(page).locator(".slot.on")).toHaveCount(1);
    await expect(drawer(page).locator(".slot.on.pop")).toHaveCount(1);
  });

  test("文字は選択でき、選択禁止の指定がない", async ({ page }) => {
    await page.goto("./");
    await btn(page).click();
    const us = await drawer(page).evaluate((el) => getComputedStyle(el).userSelect);
    expect(us).not.toBe("none");
  });

  for (const layout of ["a", "c"] as const) {
    test(`375px(${layout}レイアウト): 横スクロールなし・開閉できる`, async ({ page }) => {
      await page.addInitScript((l) => localStorage.setItem("someday-settings-v1", JSON.stringify({ layout: l })), layout);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("./");
      // 設定が保存形式と違っていても、設定画面から切り替えて確実に目的のレイアウトにする
      if (!(await page.locator(`.t.l${layout}`).count())) {
        await page.locator('[data-act="settings"]').click();
        await page.locator(`[data-k="layout"][data-v="${layout}"]`).click();
        await page.keyboard.press("Escape");
      }
      await expect(page.locator(`.t.l${layout}`)).toHaveCount(1);
      await expect(btn(page)).toContainText("スタンプ 0/10");
      const bb = await btn(page).boundingBox();
      expect(bb!.height).toBeGreaterThanOrEqual(44);
      expect(bb!.x + bb!.width).toBeLessThanOrEqual(375);
      const sw = () => page.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth]);
      expect((await sw())[0]).toBeLessThanOrEqual(375);
      expect((await sw())[1]).toBeLessThanOrEqual(375);
      await expect(page.locator("section[aria-label='達成状況']")).toContainText("0 / 0 達成");

      await btn(page).click();
      await expect(drawer(page)).toBeVisible();
      const w = (await drawer(page).boundingBox())!.width;
      expect(w).toBeCloseTo(Math.min(375 * 0.88, 360), 0);
      expect((await sw())[0]).toBeLessThanOrEqual(375);
      await page.mouse.click(10, 400);
      await expect(drawer(page)).toBeHidden();
    });
  }

  test("PCのCレイアウト: スタンプタイルがなく、ヒーロー・一覧・期限つきが崩れない", async ({ page }) => {
    await page.goto("./");
    await page.locator('[data-act="settings"]').click();
    await page.locator('[data-k="layout"][data-v="c"]').click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".t-stamp")).toHaveCount(0);
    const [h, l, n] = await Promise.all([".hero", ".t-list", ".t-next"].map((s) => page.locator(s).boundingBox()));
    expect(l!.y).toBeGreaterThanOrEqual(h!.y + h!.height - 1);
    expect(n!.x).toBeGreaterThanOrEqual(h!.x + h!.width - 1);
    expect(n!.y).toBeLessThanOrEqual(h!.y + 1);
    await expect(btn(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  });

  for (const theme of ["midnight", "wine", "forest", "navygold", "penguin"]) {
    test(`テーマ ${theme}: ドロワーの文字とスタンプ枚数が読める`, async ({ page }) => {
      await page.goto("./");
      await page.locator('[data-act="settings"]').click();
      await page.locator(`[data-k="theme"][data-v="${theme}"]`).click();
      await page.keyboard.press("Escape");
      await btn(page).click();
      const lum = (c: string) => { const m = c.match(/[\d.]+/g)!.map(Number); const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const c = await drawer(page).evaluate((el) => {
        const s = getComputedStyle(el); const n = getComputedStyle(el.querySelector(".dr-n b")!);
        const cardBg = getComputedStyle(el.querySelector(".dr-card")!).backgroundColor;
        return { text: s.color, bg: s.backgroundColor, num: n.color, cardBg };
      });
      expect(ratio(c.text, c.bg)).toBeGreaterThan(4.5);
      expect(ratio(c.num, c.cardBg)).toBeGreaterThan(3);
    });
  }
});
