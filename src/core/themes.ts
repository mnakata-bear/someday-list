/* モック(G:\AI\mock_todo_sync\index.html)から移植した定義 */
export interface Theme {
  n: string; bg: string; s: string; s2: string; b: string; t: string; m: string;
  a1: string; a2: string; st: string; on?: string; dk?: 1;
}

/* themes: bg, surface, surface2, border, text, muted, a1, a2, stamp, on(ボタン文字), dark */
export const THEMES: Record<string, Theme> = {
  penguin: { n: "ペンギン", bg: "#f2f8fe", s: "#ffffff", s2: "#e9f3fc", b: "#d5e6f5", t: "#1f2d4a", m: "#5b6d8a", a1: "#3f7fd6", a2: "#5fbcf0", st: "#e4697a" },
  lavender: { n: "ラベンダー", bg: "#f8f5fb", s: "#ffffff", s2: "#f2eef8", b: "#e8e1f1", t: "#262036", m: "#71698a", a1: "#8b6fd6", a2: "#e48bb5", st: "#e0577f" },
  sakura: { n: "サクラ", bg: "#fcf5f7", s: "#ffffff", s2: "#f8ecf0", b: "#f0dde3", t: "#33212a", m: "#86697a", a1: "#d9668c", a2: "#f2a37f", st: "#d8456f" },
  peach: { n: "ピーチ", bg: "#fdf6f1", s: "#ffffff", s2: "#f9ece3", b: "#f1dfd2", t: "#33241c", m: "#85705f", a1: "#ec7b52", a2: "#f2b53c", st: "#e0503a" },
  lemon: { n: "レモン", bg: "#fbf9ef", s: "#ffffff", s2: "#f4f1e0", b: "#e8e3c9", t: "#2b2a1c", m: "#77735a", a1: "#7fa83a", a2: "#e2b62e", st: "#cf6a2c" },
  mint: { n: "ミント", bg: "#f2f9f7", s: "#ffffff", s2: "#e7f3f0", b: "#d6e9e4", t: "#18302c", m: "#5b7570", a1: "#25a08f", a2: "#4f8fd6", st: "#1f8c7d" },
  sky: { n: "スカイ", bg: "#f3f7fd", s: "#ffffff", s2: "#e9f0fa", b: "#d9e3f2", t: "#162033", m: "#5c6b82", a1: "#3b78f0", a2: "#22b8c8", st: "#2f62d8" },
  mono: { n: "モノトーン", bg: "#f6f6f5", s: "#ffffff", s2: "#efefed", b: "#e2e2df", t: "#18181b", m: "#6e6e73", a1: "#27272a", a2: "#6b6b70", st: "#c2352b" },
  midnight: { n: "ミッドナイト", dk: 1, bg: "#0d0f15", s: "#151823", s2: "#1c2030", b: "#2a3043", t: "#eef0f7", m: "#9097ad", a1: "#36d6a0", a2: "#5b8cff", st: "#7cf0c5", on: "#06120d" },
  wine: { n: "ワイン", dk: 1, bg: "#150c12", s: "#20131b", s2: "#2a1a24", b: "#3a2632", t: "#f6ecf1", m: "#ad94a2", a1: "#ff6f91", a2: "#c084fc", st: "#ff8fab", on: "#1d0711" },
  forest: { n: "フォレスト", dk: 1, bg: "#0b130f", s: "#121c17", s2: "#18251e", b: "#26372d", t: "#ecf4ee", m: "#92a89a", a1: "#a3e635", a2: "#34d399", st: "#bef264", on: "#0b1405" },
  navygold: { n: "ネイビー＆ゴールド", dk: 1, bg: "#0c1220", s: "#131b2d", s2: "#1a2338", b: "#283350", t: "#f1f2f6", m: "#97a0b8", a1: "#e9c46a", a2: "#f4a261", st: "#f2cf7a", on: "#1a1204" },
};

export const WPS: [string, string][] = [
  ["none", "なし"], ["mesh", "にじみ"], ["dots", "ドット"], ["grid", "方眼"], ["stripe", "ストライプ"], ["ichimatsu", "市松"],
  ["sunset", "夕焼け"], ["stars", "星空"], ["aurora", "オーロラ"], ["photo", "自分の写真"],
];

export const STAMPS: Record<string, { n: string; t: string }> = {
  sumi: { n: "済", t: "済" },
  kanryo: { n: "完了", t: "完了" },
  done: { n: "DONE", t: "DONE" },
  good: { n: "よくできました", t: "よく\nできました" },
};

export const LAYOUTS: Record<string, string> = { a: "A カード", c: "C タイル" };

/** スタンプカードのマス目に押す文字 */
export function stampMark(stamp: string): string {
  if (stamp === "good") return "良";
  if (stamp === "done") return "✓";
  return (STAMPS[stamp] ?? STAMPS.sumi).t.slice(0, 1);
}
