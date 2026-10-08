/**
 * 音声入力の文から期限を読み取る(純粋関数)。
 * 例: 「来週の金曜までに歯医者を予約」→ { title: "歯医者を予約", due: <来週の金曜> }
 * 読み取れなければ due は ""(期限なし)。
 */
import { startOfDay, toYMD } from "./logic";

export interface Spoken { title: string; due: string }

const WD: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const KANJI: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 全角数字→半角、簡単な漢数字(一〜九十九)→算用数字 */
export function normalizeDigits(s: string): string {
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  return s.replace(/[一二三四五六七八九]?十[一二三四五六七八九]?(?=月|日|週間)|[〇零一二三四五六七八九](?=月|日後|週間)/g, (m) => {
    if (!m.includes("十")) return String(KANJI[m]);
    const [a, b] = m.split("十");
    return String((a ? KANJI[a] : 1) * 10 + (b ? KANJI[b] : 0));
  });
}

const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** 今日以降で最初の曜日 w(今日がその曜日なら今日) */
const nextWeekday = (t: Date, w: number) => add(t, (w - t.getDay() + 7) % 7);
/** 次の月曜(今日が月曜なら7日後) */
const nextMonday = (t: Date) => add(t, ((1 - t.getDay() + 7) % 7) || 7);
const valid = (y: number, m: number, d: number) => {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
};

type Rule = [RegExp, (m: RegExpMatchArray, t: Date) => Date | null];

// 日付表現のあとに続く語尾(まで/までに/には 等)もまとめて取り除く
const TAIL = "(?:までには|までに|まで|中に|中|には|に|の|で|は)?";
const r = (src: string) => new RegExp(`(?:${src})${TAIL}`);

const RULES: Rule[] = [
  [r("(\\d{1,2})月(\\d{1,2})日"), (m, t) => {
    const mo = +m[1], d = +m[2];
    let dt = valid(t.getFullYear(), mo, d);
    if (dt && dt < t) dt = valid(t.getFullYear() + 1, mo, d);
    return dt;
  }],
  [r("(\\d{1,3})日後"), (m, t) => add(t, +m[1])],
  [r("(\\d{1,2})週間後"), (m, t) => add(t, +m[1] * 7)],
  [r("来週の?([日月火水木金土])曜日?"), (m, t) => add(nextMonday(t), (WD[m[1]] + 6) % 7)],
  [r("来週末"), (_m, t) => add(nextWeekday(t, 6), 7)],
  [r("今週末|週末"), (_m, t) => nextWeekday(t, 6)],
  [r("来週"), (_m, t) => nextMonday(t)],
  [r("(?:今週の?)?([日月火水木金土])曜日?"), (m, t) => nextWeekday(t, WD[m[1]])],
  [r("今日|本日"), (_m, t) => t],
  [r("明後日|あさって"), (_m, t) => add(t, 2)],
  [r("明日|あした|あす"), (_m, t) => add(t, 1)],
  [r("今月末|月末"), (_m, t) => new Date(t.getFullYear(), t.getMonth() + 1, 0)],
  [r("年内|年末|今年中"), (_m, t) => new Date(t.getFullYear(), 11, 31)],
  [r("(?<![\\d月])(\\d{1,2})日(?![後間])"), (m, t) => {
    const d = +m[1];
    let dt = valid(t.getFullYear(), t.getMonth() + 1, d);
    if (dt && dt < t) {
      const nm = new Date(t.getFullYear(), t.getMonth() + 1, 1);
      dt = valid(nm.getFullYear(), nm.getMonth() + 1, d);
    }
    return dt;
  }],
];

function cleanTitle(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s、。,.・]+|[\s、。,.・]+$/g, "")
    .replace(/^(?:に|は|で|を)(?=\S)/, "")
    .trim();
}

export function parseSpoken(text: string, today: Date = new Date()): Spoken {
  const t = startOfDay(today);
  const src = normalizeDigits(text.trim());
  for (const [re, fn] of RULES) {
    const m = src.match(re);
    if (!m) continue;
    const dt = fn(m, t);
    if (!dt) continue;
    const rest = src.slice(0, m.index!) + " " + src.slice(m.index! + m[0].length);
    const title = cleanTitle(rest);
    // 期限だけ話した場合(タイトルが空)は、元の文をタイトルに残す
    return { title: title || cleanTitle(src), due: toYMD(dt) };
  }
  return { title: cleanTitle(src), due: "" };
}
