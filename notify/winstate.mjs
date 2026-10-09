// ダイアログの位置を %APPDATA%\someday-notify\window.json に保存する(SOMEDAY_STATE_DIR で上書き可)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function stateDir() {
  return process.env.SOMEDAY_STATE_DIR || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "someday-notify");
}
const file = () => join(stateDir(), "window.json");

export function loadPos() {
  try {
    const p = JSON.parse(readFileSync(file(), "utf8"));
    if (!p || typeof p !== "object") return null;
    const n = (v) => (Number.isFinite(v) ? v : null);
    return { x: n(p.x), y: n(p.y), sig: String(p.sig ?? ""), w: n(p.w), h: n(p.h), expanded: p.expanded === true };
  } catch { return null; }
}
/** 位置(x,y)・大きさ(w,h)・展開状態を保存。null は「中央」「元の大きさ」 */
export function savePos(st) {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(file(), JSON.stringify({ x: st.x, y: st.y, sig: st.sig, w: st.w, h: st.h, expanded: !!st.expanded }), "utf8");
}
export function clearPos() {
  rmSync(file(), { force: true });
}
