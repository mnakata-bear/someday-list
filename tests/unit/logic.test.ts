import { describe, expect, it } from "vitest";
import {
  applyStampDelta, diffTasks, dueInfo, firstLine, linkify, normalizeSettings, sortTasks, stampCardState, taskStats, upcoming,
  validateDue, validateNote, validateTitle,
} from "../../src/core/logic";
import type { Task } from "../../src/core/types";

const TODAY = new Date(2026, 9, 9, 15, 30); // 2026/10/9(金) 午後でも日付単位で数える
const task = (p: Partial<Task> & { id: string }): Task => ({ title: p.id, due: "", note: "", label: "", done: false, doneAt: null, createdAt: 0, updatedAt: 0, ...p });

describe("dueInfo", () => {
  it("期限なしは「いつでも」", () => {
    expect(dueInfo("", TODAY)).toEqual({ cls: "none", txt: "いつでも", short: "いつでも" });
  });
  it("今日は「今日まで」(色付き)", () => {
    expect(dueInfo("2026-10-09", TODAY)).toMatchObject({ cls: "soon", txt: "今日まで" });
  });
  it("14日以内は色付きで「あと◯日」", () => {
    expect(dueInfo("2026-10-20", TODAY)).toEqual({ cls: "soon", txt: "10/20(火)まで・あと11日", short: "あと11日" });
    expect(dueInfo("2026-10-23", TODAY).cls).toBe("soon");
  });
  it("15日以上先は色なし", () => {
    expect(dueInfo("2026-10-24", TODAY)).toMatchObject({ cls: "", short: "あと15日" });
    expect(dueInfo("2026-11-30", TODAY).txt).toBe("11/30(月)まで・あと52日");
  });
  it("過ぎたら赤の「期限切れ」", () => {
    expect(dueInfo("2026-10-05", TODAY)).toEqual({ cls: "over", txt: "期限切れ 10/5(月)", short: "期限切れ" });
  });
});

describe("sortTasks", () => {
  it("未完了→完了、期限の近い順、期限なしは後ろ、同じなら作成順", () => {
    const ts = [
      task({ id: "a", due: "", createdAt: 1 }),
      task({ id: "b", due: "2026-12-31", createdAt: 2 }),
      task({ id: "c", due: "2026-10-20", createdAt: 3 }),
      task({ id: "d", due: "2026-10-05", done: true, createdAt: 4 }),
      task({ id: "e", due: "", createdAt: 0 }),
      task({ id: "f", due: "", done: true, createdAt: 5 }),
    ];
    expect(sortTasks(ts).map((t) => t.id)).toEqual(["c", "b", "e", "a", "d", "f"]);
  });
  it("元の配列は変更しない", () => {
    const ts = [task({ id: "x", due: "" }), task({ id: "y", due: "2026-10-10" })];
    sortTasks(ts);
    expect(ts.map((t) => t.id)).toEqual(["x", "y"]);
  });
  it("upcoming は期限つき・未完了だけ", () => {
    const ts = [task({ id: "a", due: "2026-11-01" }), task({ id: "b", due: "" }), task({ id: "c", due: "2026-10-10", done: true })];
    expect(upcoming(ts).map((t) => t.id)).toEqual(["a"]);
  });
  it("taskStats", () => {
    expect(taskStats([])).toEqual({ d: 0, all: 0, left: 0, pct: 0 });
    expect(taskStats([task({ id: "a", done: true }), task({ id: "b" }), task({ id: "c" })])).toEqual({ d: 1, all: 3, left: 2, pct: 33 });
  });
});

describe("スタンプ累計", () => {
  it("完了で+1、取消で-1、0未満にしない", () => {
    expect(applyStampDelta(0, 1)).toBe(1);
    expect(applyStampDelta(5, -1)).toBe(4);
    expect(applyStampDelta(0, -1)).toBe(0);
    expect(applyStampDelta(NaN, -1)).toBe(0);
  });
  it("10個で1枚", () => {
    expect(stampCardState(0)).toEqual({ total: 0, filled: 0, completedCards: 0 });
    expect(stampCardState(3)).toMatchObject({ filled: 3, completedCards: 0 });
    expect(stampCardState(10)).toMatchObject({ filled: 10, completedCards: 1 });
    expect(stampCardState(11)).toMatchObject({ filled: 1, completedCards: 1 });
    expect(stampCardState(-4)).toMatchObject({ total: 0, filled: 0 });
  });
});

describe("入力バリデーション", () => {
  it("タイトル: 空白だけはNG、前後の空白は除く、100字まで", () => {
    expect(validateTitle("  ")).toMatchObject({ ok: false });
    expect(validateTitle(undefined)).toMatchObject({ ok: false });
    expect(validateTitle("  歯医者  ")).toEqual({ ok: true, value: "歯医者" });
    expect(validateTitle("あ".repeat(100))).toMatchObject({ ok: true });
    expect(validateTitle("あ".repeat(101))).toMatchObject({ ok: false, error: "100文字以内で入力してください" });
    expect(validateTitle("😀".repeat(100))).toMatchObject({ ok: true }); // 絵文字も1文字
  });
  it("期限: 空 or 実在する YYYY-MM-DD", () => {
    expect(validateDue("")).toEqual({ ok: true, value: "" });
    expect(validateDue("2026-10-20")).toEqual({ ok: true, value: "2026-10-20" });
    expect(validateDue("2026-02-30")).toMatchObject({ ok: false });
    expect(validateDue("2026/10/20")).toMatchObject({ ok: false });
  });
  it("メモ: 2000字まで、改行をそろえ、末尾の空白は除く", () => {
    expect(validateNote(undefined)).toEqual({ ok: true, value: "" });
    expect(validateNote("a\r\nb  \n")).toEqual({ ok: true, value: "a\nb" });
    expect(validateNote("x".repeat(2000))).toMatchObject({ ok: true });
    expect(validateNote("x".repeat(2001))).toMatchObject({ ok: false, error: "メモは2000文字以内にしてください" });
  });
});

describe("設定", () => {
  it("知らない値は既定値に戻す", () => {
    expect(normalizeSettings(null)).toEqual({ layout: "a", theme: "penguin", wp: "mesh", stamp: "sumi" });
    expect(normalizeSettings({ layout: "z", theme: "midnight", wp: "photo", stamp: "good" })).toEqual({ layout: "a", theme: "midnight", wp: "photo", stamp: "good" });
    expect(normalizeSettings({ theme: "nope", wp: "nope" })).toMatchObject({ theme: "penguin", wp: "mesh" });
  });
});

describe("メモの表示", () => {
  it("URL をリンクにし、ほかはエスケープする", () => {
    const h = linkify('見る <b>https://example.com/a?x=1&y=2</b> と "http://t.co/z"。');
    expect(h).toContain('<a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">https://example.com/a?x=1&amp;y=2</a>');
    expect(h).toContain("&lt;b&gt;");
    expect(h).toContain('<a href="http://t.co/z"');
    expect(h).not.toContain("<b>");
  });
  it("文末の句読点はリンクに含めない", () => {
    expect(linkify("ここ https://a.jp/x.")).toBe('ここ <a href="https://a.jp/x" target="_blank" rel="noopener noreferrer">https://a.jp/x</a>.');
  });
  it("javascript: はリンクにしない", () => {
    expect(linkify("javascript:alert(1)")).not.toContain("<a");
  });
  it("firstLine は最初の空でない行", () => {
    expect(firstLine("\n  \n 二行目 \n三")).toBe("二行目");
  });
});

describe("diffTasks(他端末の変更)", () => {
  it("追加・達成・取消・更新・削除を見分ける", () => {
    const a = task({ id: "a" });
    expect(diffTasks([], [a])).toEqual({ ids: ["a"], msg: "別の端末から追加されました" });
    expect(diffTasks([a], [{ ...a, done: true }])?.msg).toBe("別の端末から同期 ・ 達成！");
    expect(diffTasks([{ ...a, done: true }], [a])?.msg).toBe("別の端末から同期 ・ 未完了に戻しました");
    expect(diffTasks([a], [{ ...a, note: "x" }])?.msg).toBe("別の端末から同期 ・ 更新しました");
    expect(diffTasks([a], [])).toEqual({ ids: [], msg: "別の端末から同期 ・ 削除しました" });
    expect(diffTasks([a], [{ ...a }])).toBeNull();
  });
});
