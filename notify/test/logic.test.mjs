import { describe, it, expect } from "vitest";
import { jstDate, dateLabel, dueInfo, sortPending, buildView, demoTasks } from "../logic.mjs";

// 2026-10-09(金) 10:00 JST = 2026-10-09T01:00Z
const NOW = new Date("2026-10-09T01:00:00Z");
const mk = (id, due, extra = {}) => ({ id, title: id, due, note: "", label: "", done: false, createdAt: 0, ...extra });

describe("JST日付", () => {
  it("UTCの夕方でも JST では翌日になる", () => {
    expect(jstDate(new Date("2026-10-08T16:00:00Z")).ymd).toBe("2026-10-09");
    expect(jstDate(new Date("2026-10-08T14:59:59Z")).ymd).toBe("2026-10-08");
  });
  it("日付ラベル", () => {
    expect(dateLabel(NOW)).toBe("10月9日(金)");
    expect(dateLabel(new Date("2026-10-09T15:00:00Z"))).toBe("10月10日(土)");
  });
});

describe("dueInfo(アプリの規則と同じ)", () => {
  it("期限なし", () => expect(dueInfo("", NOW)).toMatchObject({ cls: "none", txt: "いつでも" }));
  it("過ぎたら期限切れ(赤)", () => expect(dueInfo("2026-10-08", NOW)).toMatchObject({ cls: "over", txt: "期限切れ 10/8(木)" }));
  it("今日まで", () => expect(dueInfo("2026-10-09", NOW)).toMatchObject({ cls: "soon", txt: "今日まで" }));
  it("14日以内は強調", () => {
    expect(dueInfo("2026-10-23", NOW)).toMatchObject({ cls: "soon", txt: "10/23(金)まで・あと14日" });
  });
  it("15日以上は強調なし", () => expect(dueInfo("2026-10-24", NOW)).toMatchObject({ cls: "", short: "あと15日" }));
  it("月またぎ", () => expect(dueInfo("2026-11-02", NOW).short).toBe("あと24日"));
  it("JSTの0時をまたぐと今日の扱いが変わる", () => {
    expect(dueInfo("2026-10-09", new Date("2026-10-09T15:30:00Z")).cls).toBe("over");
  });
});

describe("並べ替え", () => {
  it("期限切れ→今日→近い順→期限なし。完了は除く", () => {
    const ts = [mk("none", ""), mk("far", "2026-12-01"), mk("today", "2026-10-09"), mk("over", "2026-10-01"), mk("near", "2026-10-12"), mk("done", "2026-10-02", { done: true })];
    expect(sortPending(ts).map((t) => t.id)).toEqual(["over", "today", "near", "far", "none"]);
  });
  it("同じ期限は作成順、Timestamp風も可", () => {
    const ts = [mk("b", "", { createdAt: 5 }), mk("a", "", { createdAt: { toMillis: () => 2 } })];
    expect(sortPending(ts).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("buildView", () => {
  it("既定は5件まで、超えたら more", () => {
    const ts = Array.from({ length: 13 }, (_, i) => mk("t" + i, "", { createdAt: i }));
    const v = buildView(ts, NOW);
    expect(v.items).toHaveLength(5);
    expect(v.more).toBe(8);
    expect(v.total).toBe(13);
  });
  it("ちょうど5件なら more は 0", () => {
    expect(buildView(Array.from({ length: 5 }, (_, i) => mk("t" + i, "")), NOW).more).toBe(0);
  });
  it("件数のまとめ(期限切れ/もうすぐ)は表示件数に関係なく全体で数える", () => {
    const ts = [mk("o", "2026-10-01"), mk("t", "2026-10-09"), mk("s", "2026-10-20"), mk("f", "2027-01-01"), mk("n", "")];
    expect(buildView(ts, NOW, 2)).toMatchObject({ overdue: 1, soon: 2, total: 5, timeLabel: "10:00" });
  });
  it("挨拶は時間帯で変わる(JST)", () => {
    expect(buildView([], NOW).greeting).toBe("おはよう！");
    expect(buildView([], new Date("2026-10-09T03:00:00Z")).greeting).toBe("こんにちは！");
  });
  it("0件", () => expect(buildView([], NOW)).toMatchObject({ total: 0, more: 0, items: [] }));
  it("ラベル・メモ・期限切れの色", () => {
    const v = buildView([mk("a", "2026-10-01", { label: "work", note: " x " }), mk("b", "", { label: "private" }), mk("c", "", { label: "" })], NOW);
    expect(v.items[0]).toMatchObject({ dueCls: "over", label: "仕事", hasNote: true });
    expect(v.items[1]).toMatchObject({ label: "プライベート", hasNote: false });
    expect(v.items[2].label).toBe("");
  });
  it("デモは期限切れ/今日/期限なし/ラベル/メモが混在し 5件超", () => {
    const v = buildView(demoTasks(NOW), NOW, 99);
    const cls = new Set(v.items.map((i) => i.dueCls));
    expect(cls.has("over") && cls.has("soon") && cls.has("none")).toBe(true);
    expect(v.items.some((i) => i.hasNote)).toBe(true);
    expect(v.items.some((i) => i.label === "仕事") && v.items.some((i) => i.label === "プライベート")).toBe(true);
    expect(v.total).toBeGreaterThan(5);
  });
});
