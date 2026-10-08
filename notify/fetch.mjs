// Firestore から未完了タスクを読み取る(読み取り専用。書き込み API は使わない)
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_KEY = join(homedir(), ".someday-notify", "key.json");
export const PROJECT_ID = "itupo-app";

export function keyPath() {
  return process.env.SOMEDAY_KEY || DEFAULT_KEY;
}

export class KeyMissingError extends Error {}

/** エミュレータ接続(FIRESTORE_EMULATOR_HOST)のときは鍵不要。本番は鍵必須 */
export async function fetchPendingTasks() {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const emu = !!process.env.FIRESTORE_EMULATOR_HOST;
  let app;
  if (emu) {
    app = initializeApp({ projectId: process.env.SOMEDAY_PROJECT || "demo-someday" });
  } else {
    const p = keyPath();
    if (!existsSync(p)) throw new KeyMissingError(p);
    let json;
    try { json = JSON.parse(readFileSync(p, "utf8")); } catch { throw new Error(`鍵ファイルを読めませんでした(JSONが壊れている可能性): ${p}`); }
    app = initializeApp({ credential: cert(json), projectId: json.project_id || PROJECT_ID });
  }
  const snap = await getFirestore(app).collection("spaces").doc("home").collection("tasks").where("done", "==", false).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
