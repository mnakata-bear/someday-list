import type { Settings, Task } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { LAYOUTS, STAMPS, THEMES, WPS } from "./themes";

export const W = ["日", "月", "火", "水", "木", "金", "土"];
export const TITLE_MAX = 100;
export const NOTE_MAX = 2000;

/** ローカル時刻の 0:00 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** 10/09 のような表記(スタンプの日付) */
export function md(d: Date): string {
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
}

export interface DueInfo { cls: "" | "none" | "soon" | "over"; txt: string; short: string }

/** 期限の表示。期限なし=いつでも / あと◯日(14日以内は色付き) / 過ぎたら期限切れ */
export function dueInfo(due: string, today: Date = new Date()): DueInfo {
  if (!due) return { cls: "none", txt: "いつでも", short: "いつでも" };
  const [y, m, d] = due.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const diff = Math.round((dt.getTime() - startOfDay(today).getTime()) / 864e5);
  const label = `${m}/${d}(${W[dt.getDay()]})`;
  if (diff < 0) return { cls: "over", txt: `期限切れ ${label}`, short: "期限切れ" };
  if (diff === 0) return { cls: "soon", txt: "今日まで", short: "今日まで" };
  return { cls: diff <= 14 ? "soon" : "", txt: `${label}まで・あと${diff}日`, short: `あと${diff}日` };
}

/** 並び順: 未完了→完了、期限の近い順(期限なしは後ろ)、作成順 */
export function sortTasks(ts: Task[]): Task[] {
  const key = (t: Task) => t.due || "9";
  return [...ts].sort((a, b) =>
    (Number(a.done) - Number(b.done)) ||
    (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) ||
    (a.createdAt - b.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function taskStats(ts: Task[]) {
  const d = ts.filter((t) => t.done).length;
  return { d, all: ts.length, left: ts.length - d, pct: ts.length ? Math.round((d / ts.length) * 100) : 0 };
}

/** 期限つき・未完了を近い順に最大 n 件(C タイルの「期限つき」) */
export function upcoming(ts: Task[], n = 4): Task[] {
  return sortTasks(ts).filter((t) => t.due && !t.done).slice(0, n);
}

/* ---------- スタンプカード ---------- */
export const CARD_SIZE = 10;
/** 累計スタンプ数に、完了(+1)/取消(-1)を反映。0 未満にはしない */
export function applyStampDelta(total: number, delta: number): number {
  const t = Math.floor(Number.isFinite(total) ? total : 0) + delta;
  return t < 0 ? 0 : t;
}
/** 累計から、今のカードの押印数(0〜10)と、満了したカード枚数 */
export function stampCardState(total: number) {
  const t = Math.max(0, Math.floor(total || 0));
  const filled = t === 0 ? 0 : t % CARD_SIZE || CARD_SIZE;
  const completedCards = Math.floor(t / CARD_SIZE);
  return { total: t, filled, completedCards };
}

/* ---------- 入力バリデーション ---------- */
export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateTitle(raw: unknown): Valid<string> {
  if (typeof raw !== "string") return { ok: false, error: "やることを入力してください" };
  const v = raw.replace(/\s+/g, " ").trim();
  if (!v) return { ok: false, error: "やることを入力してください" };
  if ([...v].length > TITLE_MAX) return { ok: false, error: `${TITLE_MAX}文字以内で入力してください` };
  return { ok: true, value: v };
}

export function validateDue(raw: unknown): Valid<string> {
  if (raw === "" || raw == null) return { ok: true, value: "" };
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: "期限の日付が正しくありません" };
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return { ok: false, error: "期限の日付が正しくありません" };
  return { ok: true, value: raw };
}

export function validateNote(raw: unknown): Valid<string> {
  if (raw == null) return { ok: true, value: "" };
  if (typeof raw !== "string") return { ok: false, error: "メモが正しくありません" };
  const v = raw.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  if (v.length > NOTE_MAX) return { ok: false, error: `メモは${NOTE_MAX}文字以内にしてください` };
  return { ok: true, value: v };
}

/* ---------- 設定 ---------- */
export function normalizeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  return {
    layout: s.layout && LAYOUTS[s.layout] ? s.layout : DEFAULT_SETTINGS.layout,
    theme: s.theme && THEMES[s.theme] ? s.theme : DEFAULT_SETTINGS.theme,
    wp: s.wp && WPS.some((w) => w[0] === s.wp) ? s.wp : DEFAULT_SETTINGS.wp,
    stamp: s.stamp && STAMPS[s.stamp] ? s.stamp : DEFAULT_SETTINGS.stamp,
  };
}

/* ---------- 他端末からの変更の検出 ---------- */
export interface RemoteChange { ids: string[]; msg: string }
export function diffTasks(prev: Task[], next: Task[]): RemoteChange | null {
  const pm = new Map(prev.map((t) => [t.id, t]));
  const nm = new Map(next.map((t) => [t.id, t]));
  const ids: string[] = [];
  let msg = "";
  for (const t of next) {
    const p = pm.get(t.id);
    if (!p) { ids.push(t.id); msg ||= "別の端末から追加されました"; continue; }
    if (p.done !== t.done) { ids.push(t.id); msg ||= `別の端末から同期 ・ ${t.done ? "達成！" : "未完了に戻しました"}`; continue; }
    if (p.title !== t.title || p.due !== t.due || p.note !== t.note) { ids.push(t.id); msg ||= "別の端末から同期 ・ 更新しました"; }
  }
  let removed = 0;
  for (const p of prev) if (!nm.has(p.id)) removed++;
  if (removed && !msg) msg = "別の端末から同期 ・ 削除しました";
  if (!ids.length && !removed) return null;
  return { ids, msg };
}

/* ---------- 文字列 ---------- */
export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** テキストを HTML エスケープし、http(s) の URL だけリンクにする */
export function linkify(text: string): string {
  const re = /https?:\/\/[^\s<>"'「」『』（）()、。]+/g;
  let out = "";
  let last = 0;
  for (const m of text.matchAll(re)) {
    let url = m[0];
    const trail = url.match(/[.,!?;:]+$/);
    if (trail) url = url.slice(0, -trail[0].length);
    const i = m.index!;
    out += esc(text.slice(last, i));
    out += `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
    last = i + url.length;
  }
  return out + esc(text.slice(last));
}

/** メモの1行目(抜粋用) */
export function firstLine(note: string): string {
  return (note.split("\n").find((l) => l.trim()) ?? "").trim();
}
