// ダイアログ(show.ps1)と node の間の1行プロトコル、新規タスクの形、ウィンドウ位置の判定。
//
// show.ps1 → node(標準出力)
//   DONE <id> / UNDONE <id>        完了 / 未完了に戻す
//   ADD <req> <base64(JSON)>       新規追加 {title, due, label}(req は返事を対応づけるための番号)
//   PLACE <base64(JSON)>           出す位置を聞く {sig, screens:[{x,y,w,h}], win:{w,h}, center:{x,y}}
//   STATE <base64(JSON)>           位置・大きさ・展開状態を保存 {x, y, sig, w, h, expanded}
//                                  (x,y が null=中央に出す / w,h が null=元の大きさ)
// node → show.ps1(標準入力)
//   OK <id> / ERR <id>
//   ADDED <req> <base64(JSON 一覧の1行)> / ADDERR <req> <理由コード>
//   PLACE <x> <y> <w|-> <h|-> <0|1> <c|p>  出す位置(c=中央)と、前回の大きさ(-=元のまま)・展開状態
/** アプリ本体 src/core/logic.ts の TITLE_MAX と同じ */
export const TITLE_MAX_LEN = 100;

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const REQ_RE = /^[A-Za-z0-9]{1,16}$/;

export function encodeB64Json(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}
export function decodeB64Json(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9+/=]+$/.test(s)) return null;
  try { return JSON.parse(Buffer.from(s, "base64").toString("utf8")); } catch { return null; }
}

/** 1行を解析。わからない行は null */
export function parseLine(line) {
  const parts = String(line).trim().split(" ");
  const [cmd, a, b] = parts;
  if ((cmd === "DONE" || cmd === "UNDONE") && parts.length === 2 && ID_RE.test(a)) return { type: "done", done: cmd === "DONE", id: a };
  if (cmd === "ADD" && parts.length === 3 && REQ_RE.test(a)) {
    const input = decodeB64Json(b);
    return input && typeof input === "object" ? { type: "add", req: a, input } : null;
  }
  if (cmd === "PLACE" && parts.length === 2) {
    const env = decodeB64Json(a);
    return env && typeof env === "object" ? { type: "place", env } : null;
  }
  if (cmd === "STATE" && parts.length === 2) {
    const p = decodeB64Json(a);
    if (!p || typeof p !== "object") return null;
    const num = (v) => (Number.isFinite(v) ? Math.round(v) : null);
    const x = num(p.x), y = num(p.y);
    return {
      type: "state",
      state: {
        x: x !== null && y !== null ? x : null, y: x !== null && y !== null ? y : null,
        sig: String(p.sig ?? ""), w: num(p.w), h: num(p.h), expanded: p.expanded === true,
      },
    };
  }
  return null;
}

/* ---------- 新規タスク(src/store/local.ts buildTask・src/core/logic.ts の検証と同じ規則) ---------- */

/** タイトル: 空白をまとめて前後を削り、1〜100文字 */
export function validateTitle(raw) {
  if (typeof raw !== "string") return { ok: false, error: "empty" };
  const v = raw.replace(/\s+/g, " ").trim();
  if (!v) return { ok: false, error: "empty" };
  if ([...v].length > TITLE_MAX_LEN) return { ok: false, error: "too-long" };
  return { ok: true, value: v };
}
/** 期限: "" または実在する YYYY-MM-DD */
export function validateDue(raw) {
  if (raw === "" || raw == null) return { ok: true, value: "" };
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: "bad-due" };
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { ok: false, error: "bad-due" };
  return { ok: true, value: raw };
}
export function validateLabel(raw) {
  if (raw == null) return { ok: true, value: "" };
  if (raw === "work" || raw === "private" || raw === "") return { ok: true, value: raw };
  return { ok: false, error: "bad-label" };
}

/** Firestore に書くドキュメント(id はドキュメントID。アプリの toData と同じキー) */
export function newTaskData(input, now = Date.now()) {
  const title = validateTitle(input?.title);
  if (!title.ok) return title;
  const due = validateDue(input?.due);
  if (!due.ok) return due;
  const label = validateLabel(input?.label ?? "");
  if (!label.ok) return label;
  const t = Math.floor(now);
  return { ok: true, value: { title: title.value, due: due.value, note: "", label: label.value, done: false, doneAt: null, createdAt: t, updatedAt: t } };
}

/* ---------- ウィンドウ位置 ---------- */

/**
 * 保存した位置で出せるか判定して、出す位置を返す。
 * モニター構成(sig)が変わった・ウィンドウ上部の中央がどの画面にも入らない → 中央。
 * 入る場合は、その画面の作業領域からはみ出さないように寄せる。
 */
export function choosePosition(saved, env) {
  const center = { x: Math.round(env.center.x), y: Math.round(env.center.y), centered: true };
  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return center;
  if (String(saved.sig ?? "") !== String(env.sig ?? "")) return center;
  const { w, h } = env.win;
  const px = saved.x + w / 2, py = saved.y + Math.min(h, 120) / 2;
  const s = (env.screens || []).find((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
  if (!s) return center;
  const x = Math.round(Math.min(Math.max(saved.x, s.x), Math.max(s.x, s.x + s.w - w)));
  const y = Math.round(Math.min(Math.max(saved.y, s.y), Math.max(s.y, s.y + s.h - h)));
  return { x, y, centered: false };
}

/** PLACE の返事(位置+前回の大きさ・展開状態) */
export function placeReply(saved, env) {
  const p = choosePosition(saved, env);
  const sz = (v) => (Number.isFinite(v) && v > 0 ? String(Math.round(v)) : "-");
  return `PLACE ${p.x} ${p.y} ${sz(saved?.w)} ${sz(saved?.h)} ${saved?.expanded ? 1 : 0} ${p.centered ? "c" : "p"}`;
}
