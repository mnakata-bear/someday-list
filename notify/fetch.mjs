// Firestore の読み書き(firebase-admin)。
// 読み取り: spaces/home/tasks の未完了。書き込み: ダイアログで押したタスクの完了/取り消しと、スタンプ累計だけ。
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { taskPatch, stampAfter } from "./logic.mjs";

export const DEFAULT_KEY = join(homedir(), ".someday-notify", "key.json");
export const PROJECT_ID = "itupo-app";

export function keyPath() {
  return process.env.SOMEDAY_KEY || DEFAULT_KEY;
}

export class KeyMissingError extends Error {}

let dbCache = null;

/** エミュレータ接続(FIRESTORE_EMULATOR_HOST)のときは鍵不要。本番は鍵必須 */
export async function getDb() {
  if (dbCache) return dbCache;
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  let app;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    app = initializeApp({ projectId: process.env.SOMEDAY_PROJECT || "demo-someday" }, "notify");
  } else {
    const p = keyPath();
    if (!existsSync(p)) throw new KeyMissingError(p);
    let json;
    try { json = JSON.parse(readFileSync(p, "utf8")); } catch { throw new Error(`鍵ファイルを読めませんでした(JSONが壊れている可能性): ${p}`); }
    app = initializeApp({ credential: cert(json), projectId: json.project_id || PROJECT_ID }, "notify");
  }
  dbCache = getFirestore(app);
  return dbCache;
}

const tasksCol = (db) => db.collection("spaces").doc("home").collection("tasks");
const statsDoc = (db) => db.collection("spaces").doc("home").collection("meta").doc("stats");

export async function fetchPendingTasks() {
  const snap = await tasksCol(await getDb()).where("done", "==", false).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * タスクを完了(done=true)/未完了に戻す。スタンプ累計も ±1(0 未満にしない)。
 * すでに同じ状態なら何もしない(アプリ側で先に完了されていても二重に数えない)。
 */
export async function setDone(id, done, now = Date.now()) {
  const db = await getDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const tRef = tasksCol(db).doc(id), sRef = statsDoc(db);
  return db.runTransaction(async (tx) => {
    const t = await tx.get(tRef);
    if (!t.exists) throw new Error("not-found");
    const s = await tx.get(sRef);
    if (!!t.data().done === done) return "same";
    tx.update(tRef, taskPatch(done, now));
    if (done) tx.set(sRef, { stampTotal: FieldValue.increment(1) }, { merge: true });
    else tx.set(sRef, { stampTotal: stampAfter(Number(s.data()?.stampTotal) || 0, -1) }, { merge: true });
    return "ok";
  });
}

/** 新規タスクを追加(ID は Firestore の自動ID。アプリ本体の doc(collection).id と同じ作り方) */
export async function addTask(data) {
  const ref = tasksCol(await getDb()).doc();
  await ref.set(data);
  return ref.id;
}
