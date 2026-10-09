// ダイアログ(show.ps1)と node の間の1行プロトコル、新規タスクの形、ウィンドウ位置の判定。
//
// show.ps1 → node(標準出力)
//   DONE <id> / UNDONE <id>        完了 / 未完了に戻す
//   ADD <req> <base64(JSON)>       新規追加 {title, due, label}(req は返事を対応づけるための番号)
//   PLACE <base64(JSON)>           出す位置を聞く {sig, screens:[{x,y,w,h}], win:{w,h}, center:{x,y}}
//   STATE <base64(JSON)>           位置・大きさ・展開状態を保存 {x, y, sig, w, h, expanded, mini, mx, my, miniTop}
//                                  (x,y が null=中央に出す / w,h が null=元の大きさ / mini=ミニ表示か、mx,my=ミニの位置)
//   EXPAND <base64(JSON)>          ミニから戻すときの位置を聞く {anchor:{x,y}, at:{x,y}, win:{w,h}, screens}
// node → show.ps1(標準入力)
//   OK <id> / ERR <id>
//   ADDED <req> <base64(JSON 一覧の1行)> / ADDERR <req> <理由コード>
//   PLACE <base64(JSON)>           出す位置と前回の状態 {x, y, centered, w, h, expanded, mini, mx, my, miniTop}
//   EXPANDTO <x> <y>               ミニから戻すときの位置
//   RELOAD <base64(view)> / OPEN normal|keep   2つ目の起動からの「開いて」(定時は最新の一覧で通常表示に戻す)
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
        mini: p.mini === true, mx: num(p.mx), my: num(p.my), miniTop: p.miniTop !== false,
      },
    };
  }
  if (cmd === "EXPAND" && parts.length === 2) {
    const e = decodeB64Json(a);
    return e && e.anchor && e.win ? { type: "expand", env: e } : null;
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

const findScreen = (screens, px, py) => (screens || []).find((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** ミニ表示の保存位置が使えるか。モニター構成が変わった・画面外なら null(ウィンドウ側で決める) */
export function miniPosition(saved, env, size = 120) {
  if (!saved || !Number.isFinite(saved.mx) || !Number.isFinite(saved.my)) return null;
  if (String(saved.sig ?? "") !== String(env.sig ?? "")) return null;
  const s = findScreen(env.screens, saved.mx + size / 2, saved.my + size / 2);
  if (!s) return null;
  return { x: Math.round(clamp(saved.mx, s.x, s.x + s.w - size)), y: Math.round(clamp(saved.my, s.y, s.y + s.h - size)) };
}

/**
 * ミニから元の大きさに戻すときの位置。ペンギンの位置をそろえた anchor を基準に、
 * ミニがある画面からはみ出さないよう寄せる(右上にあれば左下へ、右下にあれば左上へ開く)。
 */
export function expandPosition(env) {
  const { anchor, at, win } = env;
  const s = findScreen(env.screens, at?.x ?? anchor.x, at?.y ?? anchor.y) || findScreen(env.screens, anchor.x, anchor.y);
  if (!s) return { x: Math.round(anchor.x), y: Math.round(anchor.y) };
  return { x: Math.round(clamp(anchor.x, s.x, s.x + s.w - win.w)), y: Math.round(clamp(anchor.y, s.y, s.y + s.h - win.h)) };
}

/**
 * PLACE の返事(位置+前回の大きさ・展開状態・ミニ表示)。
 * opts.manual: 手動(タスクバー)で開いたときだけ前回のミニ表示を引き継ぐ。定時は通常表示で知らせる
 */
export function placeInfo(saved, env, opts = {}) {
  const p = choosePosition(saved, env);
  const sz = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  const m = miniPosition(saved, env);
  return {
    x: p.x, y: p.y, centered: p.centered, w: sz(saved?.w), h: sz(saved?.h), expanded: !!saved?.expanded,
    mini: !!(opts.manual && saved?.mini), mx: m ? m.x : null, my: m ? m.y : null, miniTop: saved?.miniTop !== false,
  };
}
export function placeReply(saved, env, opts = {}) {
  return `PLACE ${encodeB64Json(placeInfo(saved, env, opts))}`;
}
