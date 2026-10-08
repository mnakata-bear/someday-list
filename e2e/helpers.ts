import type { Page } from "@playwright/test";

/** ブラウザ側の今日から n 日後の YYYY-MM-DD */
export function ymd(page: Page, n: number): Promise<string> {
  return page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, n);
}

/** 「＋」ボタンで追加シートを開く(開いていれば何もしない) */
export async function openAdder(page: Page) {
  const dlg = page.locator("#adder");
  if (!(await dlg.evaluate((d) => (d as HTMLDialogElement).open))) await page.locator("#fab").click();
  await page.locator('form[data-form="add"]').waitFor({ state: "visible" });
  await page.waitForTimeout(400); // 開くアニメーション(約0.3秒)が終わるのを待つ
}

/** 追加シートから 1 件追加。keep=true ならシートを開いたままにする(既定は Esc で閉じる) */
export async function addTask(page: Page, title: string, due = "", keep = false) {
  await openAdder(page);
  const form = page.locator('form[data-form="add"]');
  await form.locator('input[name="t"]').fill(title);
  await form.locator('input[name="d"]').fill(due);
  await form.locator('button[type="submit"]').click();
  if (!keep) {
    await page.keyboard.press("Escape");
    await page.locator("#adder").waitFor({ state: "hidden" });
  }
}

export const item = (page: Page, title: string) => page.locator(".list .item", { has: page.locator(".title", { hasText: title }) });

/**
 * SpeechRecognition のモック。
 * start() でまず途中結果(interim)を返し、stop() で window.__speech.text を確定結果として返す。
 * window.__speech.error を入れておくと、start() 後にそのエラーを返す。
 */
export const speechMock = () => {
  const w = window as unknown as Record<string, unknown>;
  w.__speech = { text: "", error: "" };
  class MockRec {
    lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      (w.__speechLast as unknown) = { lang: this.lang, interimResults: this.interimResults };
      const cfg = w.__speech as { text: string; error: string };
      setTimeout(() => {
        if (cfg.error) { this.onerror?.({ error: cfg.error }); this.onend?.(); return; }
        const partial = cfg.text.slice(0, 3);
        this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: false, length: 1, 0: { transcript: partial } } } });
      }, 50);
    }
    stop() {
      const cfg = w.__speech as { text: string };
      setTimeout(() => {
        this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: cfg.text } } } });
        this.onend?.();
      }, 20);
    }
    abort() { this.onend?.(); }
  }
  w.SpeechRecognition = MockRec;
  w.webkitSpeechRecognition = MockRec;
};
