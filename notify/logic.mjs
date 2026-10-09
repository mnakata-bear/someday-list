// 通知ウィンドウに出す内容の計算(JST基準)。src/core/logic.ts の dueInfo と同じ規則。
export const W = ["日", "月", "火", "水", "木", "金", "土"];
export const LABELS = { work: "仕事", private: "プライベート" };
export const MAX_ITEMS = 5;
const DAY = 864e5;

/** 日時を JST の { y, m, d, dow, ymd } にする */
export function jstDate(now = new Date()) {
  const j = new Date(now.getTime() + 9 * 3600e3);
  const y = j.getUTCFullYear(), m = j.getUTCMonth() + 1, d = j.getUTCDate();
  return { y, m, d, dow: j.getUTCDay(), hh: j.getUTCHours(), mm: j.getUTCMinutes(), ymd: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

export function dateLabel(now = new Date()) {
  const t = jstDate(now);
  return `${t.m}月${t.d}日(${W[t.dow]})`;
}

const utcDay = (y, m, d) => Date.UTC(y, m - 1, d);

/** 期限の表示。期限なし=いつでも / 今日まで / あと◯日(14日以内は soon) / 過ぎたら over */
export function dueInfo(due, now = new Date()) {
  if (!due) return { cls: "none", txt: "いつでも", short: "いつでも", diff: null };
  const [y, m, d] = due.split("-").map(Number);
  const t = jstDate(now);
  const diff = Math.round((utcDay(y, m, d) - utcDay(t.y, t.m, t.d)) / DAY);
  const dow = new Date(utcDay(y, m, d)).getUTCDay();
  const label = `${m}/${d}(${W[dow]})`;
  if (diff < 0) return { cls: "over", txt: `期限切れ ${label}`, short: "期限切れ", diff };
  if (diff === 0) return { cls: "soon", txt: "今日まで", short: "今日まで", diff };
  return { cls: diff <= 14 ? "soon" : "", txt: `${label}まで・あと${diff}日`, short: `あと${diff}日`, diff };
}

/** createdAt は数値(ms)のほか Timestamp 風のものも許す */
function ms(v) {
  if (typeof v === "number") return v;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  return 0;
}

/** 期限切れ → 今日まで → 期限が近い順 → 期限なし。同じ期限は作成順 */
export function sortPending(tasks) {
  const key = (t) => t.due || "9999-99-99";
  return tasks.filter((t) => !t.done).sort((a, b) =>
    (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) ||
    (ms(a.createdAt) - ms(b.createdAt)) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** ウィンドウに出す内容。最大 max 件、超えた分は more に件数 */
/** 並び順のキー(文字列比較で sortPending と同じ順になる) */
export function sortKey(t) {
  return `${t.due || "9999-99-99"}|${String(Math.max(0, ms(t.createdAt))).padStart(15, "0")}|${t.id}`;
}

/** 一覧の1行分(ウィンドウ側はこれをそのまま表示する) */
export function itemView(t, now = new Date()) {
  const di = dueInfo(t.due || "", now);
  return {
    id: String(t.id),
    key: sortKey(t),
    ca: Math.max(0, ms(t.createdAt)),
    done: !!t.done,
    dueYmd: t.due || "",
    note: typeof t.note === "string" ? t.note : "",
    title: t.title || "(無題)",
    due: di.txt,
    dueCls: di.cls,
    label: t.label === "work" || t.label === "private" ? LABELS[t.label] : "",
    labelKey: t.label === "work" || t.label === "private" ? t.label : "",
    hasNote: !!(t.note && String(t.note).trim()),
  };
}

/** 追加フォームの期限チップ(JST)。今週末=今日以降の土曜(日曜なら今日)、来週=7日後 */
export function dueChips(now = new Date()) {
  const t = jstDate(now);
  const add = (n) => {
    const d = new Date(Date.UTC(t.y, t.m - 1, t.d + n));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  const toSat = t.dow === 0 ? 0 : 6 - t.dow;
  return [
    { k: "none", label: "なし", ymd: "" },
    { k: "today", label: "今日", ymd: add(0) },
    { k: "tomorrow", label: "明日", ymd: add(1) },
    { k: "weekend", label: "今週末", ymd: add(toSat) },
    { k: "nextweek", label: "来週", ymd: add(7) },
  ];
}

/**
 * ウィンドウに出す内容。最初に max 件を見せ、残りは rest(「ほか N件」で展開)。
 * max に Infinity を渡すと全件(--all)。
 */
export function buildView(tasks, now = new Date(), max = MAX_ITEMS) {
  const sorted = sortPending(tasks);
  const all = sorted.map((t) => itemView(t, now));
  const items = all.slice(0, max);
  const rest = all.slice(items.length);
  return {
    rest,
    limit: Number.isFinite(max) ? max : MAX_ITEMS,
    expanded: !Number.isFinite(max),
    chips: dueChips(now),
    kind: "list",
    greeting: jstDate(now).hh < 11 ? "おはよう！" : jstDate(now).hh < 17 ? "こんにちは！" : "こんばんは！",
    dateLabel: dateLabel(now),
    timeLabel: (() => { const t = jstDate(now); return `${String(t.hh).padStart(2, "0")}:${String(t.mm).padStart(2, "0")}`; })(),
    overdue: sorted.filter((t) => dueInfo(t.due || "", now).cls === "over").length,
    soon: sorted.filter((t) => dueInfo(t.due || "", now).cls === "soon").length,
    heading: "いつかやること",
    total: sorted.length,
    items,
    more: Math.max(0, sorted.length - items.length),
    appUrl: "https://mnakata-bear.github.io/someday-list/",
  };
}

/** --demo 用のダミー(期限切れ/今日/期限なし/ラベル/メモ混在・12件) */
export function demoTasks(now = new Date()) {
  const t = jstDate(now);
  const add = (n) => {
    const d = new Date(Date.UTC(t.y, t.m - 1, t.d + n));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  const mk = (i, title, due, label = "", note = "") => ({ id: `d${i}`, title, due, note, label, done: false, createdAt: i });
  return [
    mk(1, "役所に住所変更の書類を出す", add(-3), "private", "平日の9時〜17時のみ"),
    mk(2, "見積書を取引先に送る", add(-1), "work"),
    mk(3, "歯医者の予約を入れる", add(0), "private"),
    mk(4, "請求書の締め処理", add(0), "work", "経理に確認してから"),
    mk(5, "実家に電話する", add(3), "private"),
    mk(6, "来期の予算案を見直す", add(9), "work", "前年比を表にする"),
    mk(7, "自転車のタイヤ交換", add(20), ""),
    mk(8, "本棚の整理", "", "private"),
    mk(9, "ブログの下書きを仕上げる", "", ""),
    mk(10, "使っていないサブスクを解約する", "", "", "3つ見つかっている"),
    mk(11, "写真データのバックアップ", "", "private"),
    mk(12, "名刺を整理する", "", "work"),
  ];
}

/* ---------- ダイアログからの完了/取り消し ---------- */
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** show.ps1 から届く1行(DONE <id> / UNDONE <id>)を解析。それ以外は null */
export function parseCommand(line) {
  const m = /^(DONE|UNDONE) (\S+)$/.exec(String(line).trim());
  if (!m || !ID_RE.test(m[2])) return null;
  return { done: m[1] === "DONE", id: m[2] };
}

/** タスクに書き込む内容(アプリ本体 src/store/firestore.ts の setDone と同じ形) */
export function taskPatch(done, now) {
  const t = Math.floor(now);
  return { done, doneAt: done ? t : null, updatedAt: t };
}

/** スタンプ累計に ±1(0 未満にはしない。src/core/logic.ts の applyStampDelta と同じ) */
export function stampAfter(total, delta) {
  const t = Math.floor(Number.isFinite(total) ? total : 0) + delta;
  return t < 0 ? 0 : t;
}
