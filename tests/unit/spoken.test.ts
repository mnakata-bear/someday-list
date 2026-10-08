import { describe, expect, it } from "vitest";
import { normalizeDigits, parseSpoken } from "../../src/core/spoken";

const FRI = new Date(2026, 9, 9); // 2026/10/9 金曜
const p = (s: string, d = FRI) => parseSpoken(s, d);

describe("parseSpoken 期限の読み取り", () => {
  it("来週の金曜までに歯医者を予約", () => {
    expect(p("来週の金曜までに歯医者を予約")).toEqual({ title: "歯医者を予約", due: "2026-10-16" });
  });
  it("今日・明日・あさって", () => {
    expect(p("今日中に洗濯")).toEqual({ title: "洗濯", due: "2026-10-09" });
    expect(p("明日までに牛乳を買う")).toEqual({ title: "牛乳を買う", due: "2026-10-10" });
    expect(p("あさって美容院")).toEqual({ title: "美容院", due: "2026-10-11" });
    expect(p("明後日には返信する")).toEqual({ title: "返信する", due: "2026-10-11" });
  });
  it("週末/今週末 = 次の土曜", () => {
    expect(p("週末に部屋の掃除")).toEqual({ title: "部屋の掃除", due: "2026-10-10" });
    expect(p("今週末までに洗車")).toEqual({ title: "洗車", due: "2026-10-10" });
  });
  it("来週 = 次の月曜", () => {
    expect(p("来週までに書類を出す")).toEqual({ title: "書類を出す", due: "2026-10-12" });
    expect(p("来週、書類を出す", new Date(2026, 9, 12))).toMatchObject({ due: "2026-10-19", title: "書類を出す" }); // 月曜に言ったら翌週の月曜
  });
  it("来週の◯曜", () => {
    expect(p("来週の月曜に電話")).toMatchObject({ due: "2026-10-12", title: "電話" });
    expect(p("来週日曜に釣り")).toMatchObject({ due: "2026-10-18", title: "釣り" });
  });
  it("◯曜日 = 今日以降で最初のその曜日", () => {
    expect(p("水曜日までにレポート")).toEqual({ title: "レポート", due: "2026-10-14" });
    expect(p("金曜に飲み会")).toMatchObject({ due: "2026-10-09" });
  });
  it("◯日(過ぎていたら来月)", () => {
    expect(p("20日までに振り込み")).toEqual({ title: "振り込み", due: "2026-10-20" });
    expect(p("5日に検診")).toMatchObject({ due: "2026-11-05" });
  });
  it("◯月◯日(過ぎていたら来年)", () => {
    expect(p("12月24日までにプレゼントを買う")).toEqual({ title: "プレゼントを買う", due: "2026-12-24" });
    expect(p("3月1日 確定申告")).toEqual({ title: "確定申告", due: "2027-03-01" });
    expect(p("十二月三十一日に大掃除")).toMatchObject({ due: "2026-12-31" });
    expect(p("１１月３日に紅葉")).toMatchObject({ due: "2026-11-03" });
  });
  it("◯日後・◯週間後", () => {
    expect(p("3日後に返却")).toEqual({ title: "返却", due: "2026-10-12" });
    expect(p("2週間後までに提出")).toMatchObject({ due: "2026-10-23", title: "提出" });
  });
  it("月末・年内・年末", () => {
    expect(p("月末までに家賃")).toEqual({ title: "家賃", due: "2026-10-31" });
    expect(p("年内に引っ越しの準備")).toEqual({ title: "引っ越しの準備", due: "2026-12-31" });
    expect(p("年末までに大掃除")).toMatchObject({ due: "2026-12-31" });
  });
  it("日付が後ろにあっても取れる", () => {
    expect(p("歯医者を予約 来週の金曜まで")).toEqual({ title: "歯医者を予約", due: "2026-10-16" });
  });
  it("読み取れなければ期限なし", () => {
    expect(p("いつか富士山に登る")).toEqual({ title: "いつか富士山に登る", due: "" });
    expect(p("一日中ゲームする")).toEqual({ title: "一日中ゲームする", due: "" });
    expect(p("十分に休む")).toEqual({ title: "十分に休む", due: "" });
    expect(p("毎日ストレッチ")).toEqual({ title: "毎日ストレッチ", due: "" });
  });
  it("実在しない日付は無視", () => {
    expect(p("2月30日に何か")).toMatchObject({ due: "" });
  });
  it("期限だけ話したらタイトルは元の文", () => {
    expect(p("明日")).toEqual({ title: "明日", due: "2026-10-10" });
  });
  it("normalizeDigits", () => {
    expect(normalizeDigits("１２月二十五日")).toBe("12月25日");
  });
});
