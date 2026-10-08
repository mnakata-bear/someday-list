import { expect, test } from "@playwright/test";
import { addTask, item } from "./helpers";

test.describe("ラベル(ローカルモード)", () => {
  test("追加時にラベル→チップ表示→編集で変更→絞り込み→リロード後も維持", async ({ page }) => {
    await page.goto("./");
    const form = page.locator('form[data-form="add"]');
    const work = form.locator('[data-lbl="work"]');
    const priv = form.locator('[data-lbl="private"]');

    // タップ領域は 44px 以上。もう一度押すと未設定に戻る
    expect((await work.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await work.click();
    await expect(work).toHaveAttribute("aria-pressed", "true");
    await work.click();
    await expect(work).toHaveAttribute("aria-pressed", "false");

    await work.click();
    await addTask(page, "企画書を出す");
    await expect(item(page, "企画書").locator(".lchip")).toHaveText("仕事");
    await expect(item(page, "企画書").locator(".lchip")).toHaveClass(/lpop/); // 押印アニメ
    // 直前に選んだラベルは次の追加でも維持
    await expect(work).toHaveAttribute("aria-pressed", "true");
    await addTask(page, "会議室を予約");
    await expect(item(page, "会議室").locator(".lchip")).toHaveText("仕事");
    await priv.click();
    await expect(work).toHaveAttribute("aria-pressed", "false");
    await addTask(page, "旅行の計画");
    await priv.click(); // 未設定へ
    await expect(priv).toHaveAttribute("aria-pressed", "false");
    await addTask(page, "ラベルなしの用事");
    await addTask(page, "もう一つ未設定");
    await expect(item(page, "旅行").locator(".lchip")).toHaveText("プライベート");
    await expect(item(page, "ラベルなし").locator(".lchip")).toHaveCount(0);
    // 文字はテキストで、選択できる
    expect(await item(page, "旅行").locator(".lchip").evaluate((el) => getComputedStyle(el).userSelect)).not.toBe("none");

    // 件数つきタブ
    const tab = (k: string) => page.locator(`[data-flt="${k}"]`);
    await expect(tab("all")).toContainText("5");
    await expect(tab("work")).toContainText("2");
    await expect(tab("private")).toContainText("1");

    // 編集で変更(仕事→プライベート)
    await item(page, "企画書").locator("[data-edit]").click();
    const ed = page.locator("#editor");
    await expect(ed.locator('[data-elbl="work"]')).toHaveAttribute("aria-pressed", "true");
    await ed.locator('[data-elbl="private"]').click();
    await ed.locator('button[type="submit"]').click();
    await expect(item(page, "企画書").locator(".lchip")).toHaveText("プライベート");
    await expect(tab("work")).toContainText("1");
    await expect(tab("private")).toContainText("2");

    // 進捗は全体のまま
    await item(page, "会議室").locator('input[type="checkbox"]').check();
    await tab("work").click();
    await expect(page.locator(".list .item")).toHaveCount(1);
    await expect(page.locator(".list .item .title")).toHaveText("会議室を予約");
    await expect(page.locator(".big").first()).toContainText("1");
    await expect(page.getByTestId("scard")).toHaveAttribute("data-total", "1");
    await expect(page.locator("section[aria-label='達成状況']")).toContainText("/ 5 達成");

    // 絞り込み中に追加すると、そのラベルが付く(追加フォームのラベル選択はそのラベルに固定)
    await expect(form.locator('[data-lbl="work"]')).toHaveAttribute("aria-pressed", "true");
    await addTask(page, "仕事の新規");
    await expect(item(page, "仕事の新規").locator(".lchip")).toHaveText("仕事");
    await expect(tab("work")).toContainText("2");

    // リロード後も絞り込みとラベルが残る
    await page.reload();
    await expect(tab("work")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".list .item")).toHaveCount(2);
    await tab("all").click();
    await expect(page.locator(".list .item")).toHaveCount(6);
    await expect(item(page, "企画書").locator(".lchip")).toHaveText("プライベート");
    await page.reload();
    await expect(tab("all")).toHaveAttribute("aria-pressed", "true");

    // 編集で外せる
    await item(page, "企画書").locator("[data-edit]").click();
    await page.locator('#editor [data-elbl="private"]').click();
    await page.locator('#editor button[type="submit"]').click();
    await expect(item(page, "企画書").locator(".lchip")).toHaveCount(0);
  });

  test("ラベルの無い既存データはそのまま動く", async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem("someday-tasks-v1")) {
        localStorage.setItem("someday-tasks-v1", JSON.stringify({ tasks: [{ id: "old1", title: "昔のやること", due: "", note: "", done: false, doneAt: null, createdAt: 1, updatedAt: 1 }], stampTotal: 0 }));
      }
    });
    await page.goto("./");
    await expect(item(page, "昔のやること")).toBeVisible();
    await expect(item(page, "昔のやること").locator(".lchip")).toHaveCount(0);
    await expect(page.locator('[data-flt="all"]')).toContainText("1");
  });

  test("絞り込みで0件のときは案内を出す", async ({ page }) => {
    await page.goto("./");
    await addTask(page, "ひとつだけ");
    await page.locator('[data-flt="private"]').click();
    await expect(page.locator(".empty")).toContainText("プライベートのやることはまだありません");
  });

  test("スマホ幅(375px)でも横スクロールなし・ラベル選択は44px以上、全テーマでチップが読める", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("./");
    const form = page.locator('form[data-form="add"]');
    await form.locator('[data-lbl="private"]').click();
    for (let i = 0; i < 3; i++) await addTask(page, `とても長いタイトルのやることを入れてもラベルがあっても横にはみ出さないことを確認 ${i}`, "2030-01-0" + (i + 1));
    await form.locator('[data-lbl="private"]').click();
    await form.locator('[data-lbl="work"]').click();
    await addTask(page, "仕事の用事");
    for (const k of ["work", "private"]) {
      expect((await form.locator(`[data-lbl="${k}"]`).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect((await page.locator('[data-flt="work"]').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const sw = () => page.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth]);
    expect((await sw())[0]).toBeLessThanOrEqual(375);
    expect((await sw())[1]).toBeLessThanOrEqual(375);
    // 編集シートにもラベルがあり、はみ出さない
    await item(page, "仕事の用事").locator("[data-edit]").click();
    await expect(page.locator('#editor [data-elbl="work"]')).toHaveAttribute("aria-pressed", "true");
    expect((await page.locator("#editor").boundingBox())!.width).toBeLessThanOrEqual(375);
    expect((await sw())[0]).toBeLessThanOrEqual(375);
    await page.keyboard.press("Escape");
    // 全テーマでチップが見える(文字色が背景と同化していない)
    await page.locator('[data-act="settings"]').click();
    const keys = await page.locator('#settings [data-k="theme"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.v!));
    await page.keyboard.press("Escape");
    for (const k of keys) {
      await page.locator('[data-act="settings"]').click();
      await page.locator(`#settings [data-k="theme"][data-v="${k}"]`).click();
      await page.keyboard.press("Escape");
      const chip = item(page, "仕事の用事").locator(".lchip");
      await expect(chip).toBeVisible();
      const ratio = await chip.evaluate((el) => {
        const cv = document.createElement("canvas").getContext("2d")!;
        const rgb = (c: string) => { cv.fillStyle = "#000"; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data].slice(0, 3); };
        const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bg = getComputedStyle(document.getElementById("app")!).getPropertyValue("--surface").trim();
        const l1 = lum(rgb(getComputedStyle(el).color)), l2 = lum(rgb(bg));
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      });
      expect(ratio, `テーマ ${k} のチップ文字のコントラスト比`).toBeGreaterThanOrEqual(3);
    }
  });

  test("PC のCレイアウトでも崩れない", async ({ page }) => {
    await page.goto("./");
    await page.locator('[data-act="settings"]').click();
    await page.locator('#settings [data-k="layout"][data-v="c"]').click();
    await page.keyboard.press("Escape");
    await page.locator('.lblpick [data-lbl="work"]').click();
    await addTask(page, "Cレイアウトの仕事");
    await expect(item(page, "Cレイアウト").locator(".lchip")).toHaveText("仕事");
    await expect(page.locator(".ftabs")).toBeVisible();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(1280);
  });
});
