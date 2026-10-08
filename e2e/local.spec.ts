import { expect, test } from "@playwright/test";
import { addTask, item, speechMock, ymd } from "./helpers";
import { parseSpoken } from "../src/core/spoken";

test.describe("ローカルモード(PC幅)", () => {
  test("ローカルモード表示と空状態", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByTestId("sync")).toHaveText("ローカルモード(同期オフ)");
    await expect(page.locator(".empty")).toContainText("まっさら！");
    await expect(page.locator(".pc-in")).toBeVisible();
  });

  test("追加→チェックでスタンプ→スタンプカード増→取消→編集→削除→元に戻す→リロード後も残る", async ({ page }) => {
    await page.goto("./");
    const due5 = await ymd(page, 5);

    // 追加(期限あり/なし)
    await addTask(page, "パスポートを更新する", due5);
    await expect(page.locator(".toast")).toContainText("追加しました");
    await addTask(page, "ピアノをもう一度はじめる");
    await expect(page.locator(".list .item")).toHaveCount(2);
    await expect(item(page, "パスポート").locator(".due")).toHaveText(/あと5日/);
    await expect(item(page, "パスポート").locator(".due")).toHaveClass(/soon/);
    await expect(item(page, "ピアノ").locator(".due")).toHaveText("いつでも");
    // 期限ありが先
    await expect(page.locator(".list .item .title").first()).toHaveText("パスポートを更新する");

    // 空のタイトルはエラー
    await addTask(page, "   ");
    await expect(page.locator('form[data-form="add"] .ferr')).toHaveText("やることを入力してください");
    await expect(page.locator(".list .item")).toHaveCount(2);

    // チェック → スタンプ表示・スタンプカード +1
    const scard = page.getByTestId("scard");
    await expect(scard).toHaveAttribute("data-total", "0");
    await item(page, "ピアノ").locator('input[type="checkbox"]').check();
    const piano = item(page, "ピアノ");
    await expect(piano).toHaveClass(/done/);
    await expect(piano.locator(".stamp")).toBeVisible();
    await expect(piano.locator(".stamp b")).toHaveText("済");
    await expect(scard).toHaveAttribute("data-total", "1");
    await expect(scard.locator(".slot.on")).toHaveCount(1);
    await expect(page.locator(".big").first()).toContainText("1");
    // 完了は下へ
    await expect(page.locator(".list .item .title").last()).toHaveText("ピアノをもう一度はじめる");

    // 取消 → スタンプ消える・カード -1
    await piano.locator('input[type="checkbox"]').uncheck();
    await expect(piano.locator(".stamp")).toHaveCount(0);
    await expect(scard).toHaveAttribute("data-total", "0");

    // 編集(タイトル・期限)
    await item(page, "パスポート").locator("[data-edit]").click();
    const ed = page.locator("#editor");
    await expect(ed).toBeVisible();
    await ed.locator('input[name="title"]').fill("パスポートを更新する(10年)");
    await ed.locator("[data-clear-due]").click();
    await ed.locator('button[type="submit"]').click();
    await expect(ed).toBeHidden();
    await expect(item(page, "10年").locator(".due")).toHaveText("いつでも");

    // リロードしても残る
    await page.reload();
    await expect(page.locator(".list .item")).toHaveCount(2);
    await expect(item(page, "パスポートを更新する(10年)")).toBeVisible();

    // 削除 → 元に戻す
    await item(page, "ピアノ").locator(".ibody").click(); // 行のタップでも編集が開く
    await expect(ed).toBeVisible();
    await ed.locator("[data-del]").click();
    await expect(page.locator(".list .item")).toHaveCount(1);
    await expect(page.locator(".toast")).toContainText("を削除しました");
    await page.locator(".toast .tact").click();
    await expect(page.locator(".list .item")).toHaveCount(2);

    // もう一度削除して、リロード後も消えたまま
    await item(page, "ピアノ").locator("[data-edit]").click();
    await ed.locator("[data-del]").click();
    await expect(page.locator(".list .item")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".list .item")).toHaveCount(1);
    await expect(item(page, "ピアノ")).toHaveCount(0);
  });

  test("メモ: 追加・表示・URLリンク・保存・2000字制限", async ({ page }) => {
    await page.goto("./");
    await addTask(page, "京都で紅葉を見る");
    // 追加直後のトーストから「メモを書く」
    await page.locator(".toast .tact", { hasText: "メモを書く" }).click();
    const ed = page.locator("#editor");
    const ta = ed.locator('textarea[name="note"]');
    await expect(ta).toBeFocused();
    await ta.fill("宿の候補: https://example.com/kyoto?a=1&b=2\n嵐山は朝早めに");
    await expect(ed.locator(".cnt")).toHaveText(/^\d+ \/ 2000$/);
    await ed.locator('button[type="submit"]').click();

    // 一覧にはメモアイコン+1行目の抜粋、URL はリンク
    const it = item(page, "京都");
    await expect(it.locator(".notex")).toBeVisible();
    await expect(it.locator(".notex .nt")).toContainText("宿の候補:");
    await expect(it.locator(".notex .nt")).not.toContainText("嵐山");
    const a = it.locator(".notex a");
    await expect(a).toHaveAttribute("href", "https://example.com/kyoto?a=1&b=2");
    await expect(a).toHaveAttribute("rel", /noopener/);
    await expect(a).toHaveAttribute("target", "_blank");

    // リロード後も残り、編集画面で全文(リンク付き)が見える
    await page.reload();
    await item(page, "京都").locator("[data-edit]").click();
    const view = ed.getByTestId("note-view");
    await expect(view).toContainText("嵐山は朝早めに");
    await expect(view.locator("a")).toHaveText("https://example.com/kyoto?a=1&b=2");

    // 編集 → 2000字まで
    await ed.locator("[data-note-edit]").click();
    await expect(ta).toHaveAttribute("maxlength", "2000");
    await ta.fill("あ".repeat(2000));
    await expect(ed.locator(".cnt")).toHaveText("2000 / 2000");
    await expect(ed.locator(".cnt")).toHaveClass(/over/);
    // maxlength をすり抜けた 2001 字は保存できない
    await ta.evaluate((el: HTMLTextAreaElement) => { el.value = "い".repeat(2001); });
    await ed.locator('button[type="submit"]').click();
    await expect(ed.locator(".ferr")).toHaveText("メモは2000文字以内にしてください");
    await ta.fill("短いメモに変更");
    await ed.locator('button[type="submit"]').click();
    await expect(ed).toBeHidden();
    await expect(item(page, "京都").locator(".notex .nt")).toHaveText("短いメモに変更");
    await page.reload();
    await expect(item(page, "京都").locator(".notex .nt")).toHaveText("短いメモに変更");
  });

  test("テーマ/壁紙/レイアウト/スタンプの切替が反映・保存される", async ({ page }) => {
    await page.goto("./");
    await addTask(page, "部屋の模様替え");
    const app = page.locator("#app");
    await expect(app).toHaveClass(/\bla\b/);
    await expect(page.locator(".bgwall")).toHaveClass(/wp-mesh/);
    expect(await app.evaluate((el) => el.style.getPropertyValue("--a1"))).toBe("#3f7fd6"); // 既定はペンギン

    await page.locator('[data-act="settings"]').click();
    const st = page.locator("#settings");
    await expect(st).toBeVisible();
    await st.locator('[data-k="theme"][data-v="midnight"]').click();
    await st.locator('[data-k="wp"][data-v="aurora"]').click();
    await st.locator('[data-k="layout"][data-v="c"]').click();
    await st.locator('[data-k="stamp"][data-v="done"]').click();
    await expect(st.locator('[data-k="theme"][data-v="midnight"]')).toHaveAttribute("aria-pressed", "true");
    await expect(st).toContainText("この端末の中だけ");
    await expect(st).toContainText("Google のサーバー");
    await st.locator("[data-close]").first().click();

    await expect(app).toHaveClass(/\blc\b/);
    await expect(app).toHaveClass(/\bdk\b/);
    await expect(app).toHaveClass(/st-done/);
    await expect(page.locator(".bgwall")).toHaveClass(/wp-aurora/);
    await expect(page.locator(".t-next")).toBeVisible();
    expect(await app.evaluate((el) => el.style.getPropertyValue("--bg"))).toBe("#0d0f15");
    await item(page, "模様替え").locator('input[type="checkbox"]').check();
    await expect(item(page, "模様替え").locator(".stamp b")).toHaveText("DONE");

    await page.reload();
    await expect(app).toHaveClass(/\blc\b/);
    await expect(app).toHaveClass(/\bdk\b/);
    await expect(page.locator(".bgwall")).toHaveClass(/wp-aurora/);
    await expect(item(page, "模様替え").locator(".stamp b")).toHaveText("DONE");
    // ほかのスタンプ
    await page.locator('[data-act="settings"]').click();
    await page.locator('#settings [data-k="stamp"][data-v="good"]').click();
    await page.keyboard.press("Escape");
    await expect(item(page, "模様替え").locator(".stamp b")).toHaveText("よく\nできました");
  });

  test("自分の写真の壁紙は端末内(IndexedDB)に保存され、リロード後も使える", async ({ page }) => {
    await page.goto("./");
    await page.locator('[data-act="settings"]').click();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNk+M/AwMDAwMDAwMDAAAAhHgIBWtJr1gAAAABJRU5ErkJggg==", "base64");
    const chooser = page.waitForEvent("filechooser");
    await page.locator('#settings [data-k="wp"][data-v="photo"]').click();
    await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: png });
    await expect(page.locator(".bgwall")).toHaveClass(/wp-photo/);
    expect(await page.locator("#app").evaluate((el) => el.style.getPropertyValue("--photo"))).toContain("blob:");
    await page.reload();
    await expect(page.locator(".bgwall")).toHaveClass(/wp-photo/);
  });

  test("文字が選択できる(user-select: none が無い)", async ({ page }) => {
    await page.goto("./");
    await addTask(page, "選択できるか");
    const us = await item(page, "選択できるか").locator(".title").evaluate((el) => getComputedStyle(el).userSelect);
    expect(us).not.toBe("none");
    const us2 = await page.getByTestId("sync").evaluate((el) => getComputedStyle(el).userSelect);
    expect(us2).not.toBe("none");
  });
});

test.describe("音声入力(SpeechRecognition をモック)", () => {
  test("話した文がタイトルと期限に入る(自動では追加しない)", async ({ page }) => {
    await page.addInitScript(speechMock);
    await page.goto("./");
    const text = "来週の金曜までに歯医者を予約";
    await page.evaluate((t) => { (window as unknown as { __speech: { text: string } }).__speech.text = t; }, text);
    const mic = page.locator('[data-mic="add"]');
    await expect(mic).toBeVisible();
    const box = await mic.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await mic.click();
    await expect(mic).toHaveClass(/\bon\b/);
    await expect(page.locator('[data-vstat="add"]')).toHaveText("聞いています…");
    await expect(page.locator('input[name="t"]')).toHaveValue("来週の"); // 途中結果
    expect(await page.evaluate(() => (window as unknown as { __speechLast: unknown }).__speechLast)).toEqual({ lang: "ja-JP", interimResults: true });
    await mic.click(); // もう一度押すと停止
    await expect(mic).not.toHaveClass(/\bon\b/);
    await expect(page.locator('[data-vstat="add"]')).toBeHidden();
    const exp = await page.evaluate(() => new Date().toISOString());
    const want = parseSpoken(text, new Date(exp));
    await expect(page.locator('input[name="t"]')).toHaveValue("歯医者を予約");
    await expect(page.locator('input[name="d"]')).toHaveValue(want.due);
    await expect(page.locator(".list .item")).toHaveCount(0); // 確認してから追加
    await page.locator('form[data-form="add"] button[type="submit"]').click();
    await expect(item(page, "歯医者を予約")).toBeVisible();
  });

  test("マイク権限の拒否はエラー表示", async ({ page }) => {
    await page.addInitScript(speechMock);
    await page.goto("./");
    await page.evaluate(() => { (window as unknown as { __speech: { error: string } }).__speech.error = "not-allowed"; });
    await page.locator('[data-mic="add"]').click();
    await expect(page.locator(".toast")).toContainText("マイクの使用が許可されていません");
    await expect(page.locator('[data-mic="add"]')).not.toHaveClass(/\bon\b/);
  });

  test("メモ欄にもマイクで追記できる(期限は読み取らない)", async ({ page }) => {
    await page.addInitScript(speechMock);
    await page.goto("./");
    await addTask(page, "旅行の準備");
    await item(page, "旅行").locator("[data-edit]").click();
    const ed = page.locator("#editor");
    await ed.locator("[data-note-edit]").click();
    const ta = ed.locator('textarea[name="note"]');
    await ta.fill("持ち物");
    await page.evaluate(() => { (window as unknown as { __speech: { text: string } }).__speech.text = "明日までにカメラの充電"; });
    await ed.locator('[data-mic="note"]').click();
    await expect(ed.locator('[data-vstat="note"]')).toBeVisible();
    await ed.locator('[data-mic="note"]').click();
    await expect(ta).toHaveValue("持ち物\n明日までにカメラの充電");
    await ed.locator('button[type="submit"]').click();
    await expect(item(page, "旅行").locator(".due")).toHaveText("いつでも");
  });

  test("非対応ブラウザではマイクボタンを出さない", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.SpeechRecognition; delete w.webkitSpeechRecognition;
      Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    });
    await page.goto("./");
    await expect(page.locator('form[data-form="add"]')).toBeVisible();
    await expect(page.locator('[data-mic="add"]')).toHaveCount(0);
  });
});

test.describe("レスポンシブ", () => {
  test("375px 幅: スマホ用レイアウト・横スクロールなし・追加フォームは下に固定", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("./");
    await addTask(page, "とても長いタイトルのやることを入れても横にはみ出さないことを確認するためのテキストですよ");
    await addTask(page, "Averyveryverylongwordwithoutanyspacesthatcouldbreakthelayoutifnotwrappedproperly", await ymd(page, 3));
    for (let i = 0; i < 8; i++) await addTask(page, `やること ${i + 1}`);
    await expect(page.locator(".ph")).toBeVisible();
    await expect(page.locator(".pc-in")).toHaveCount(0);
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth]);
    expect(sw[0]).toBeLessThanOrEqual(375);
    expect(sw[1]).toBeLessThanOrEqual(375);
    const foot = page.locator(".ph-foot");
    expect(await foot.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    const fb = await foot.boundingBox();
    expect(Math.round(fb!.y + fb!.height)).toBe(812);
    // 設定シートを開いても横にはみ出さない
    await page.locator('[data-act="settings"]').click();
    const dlg = await page.locator("#settings").boundingBox();
    expect(dlg!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test("900px 以上でPCレイアウト、899px でスマホレイアウト", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto("./");
    await expect(page.locator(".pc-in")).toBeVisible();
    await expect(page.locator(".ph")).toHaveCount(0);
    // 入力途中の文字は、レイアウトが切り替わっても消えない
    await page.locator('input[name="t"]').fill("入力途中");
    await page.setViewportSize({ width: 899, height: 800 });
    await expect(page.locator(".ph")).toBeVisible();
    await expect(page.locator(".pc-in")).toHaveCount(0);
    await expect(page.locator('input[name="t"]')).toHaveValue("入力途中");
  });
});

test.describe("PWA", () => {
  test.use({ serviceWorkers: "allow" });
  test("manifest とアイコン、Service Worker でオフライン起動", async ({ page, context }) => {
    await page.goto("./");
    const manifest = await page.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]')?.getAttribute("href");
      return href ? (await fetch(href)).json() : null;
    });
    expect(manifest).toMatchObject({ name: "いつかやること", display: "standalone", theme_color: "#3f7fd6" });
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); // SW の管理下に入る
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await addTask(page, "オフライン前");
    await context.setOffline(true);
    await page.reload();
    await expect(item(page, "オフライン前")).toBeVisible();
    await addTask(page, "オフラインで追加");
    await expect(item(page, "オフラインで追加")).toBeVisible();
    await context.setOffline(false);
  });
});
