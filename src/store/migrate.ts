import {
  collection, doc, getDocFromServer, getDocsFromServer, increment, writeBatch, type Firestore,
} from "firebase/firestore";
import { hasLegacyData, planMigration } from "../core/migration";
import { SPACE, toData, toTask } from "./firestore";

export interface MigrationResult { moved: number; legacy: number }

/** 同じ uid の移行は順番に 1 つずつ(前の移行が終わってから、もう一度確かめる) */
let queue: Promise<unknown> = Promise.resolve();

/**
 * 旧データ users/{uid}/... を共有スペース spaces/home/... へ移し、旧データを消す。
 * 旧データが無ければ何もしない(消したあとは二度と動かない)。
 * サーバーから読めないとき(オフラインなど)は例外になるので、次に開いたとき(ログイン状態の確定時)にやり直す。
 */
export function migrateLegacy(db: Firestore, uid: string): Promise<MigrationResult | null> {
  const run = queue.then(() => migrateOnce(db, uid), () => migrateOnce(db, uid));
  queue = run.catch(() => undefined);
  return run;
}

async function migrateOnce(db: Firestore, uid: string): Promise<MigrationResult | null> {
  const oldBase = `users/${uid}`;
  const oldTasksSnap = await getDocsFromServer(collection(db, oldBase, "tasks"));
  const oldStats = await getDocFromServer(doc(db, oldBase, "meta", "stats"));
  const oldSettings = await getDocFromServer(doc(db, oldBase, "meta", "settings"));
  const legacy = {
    tasks: oldTasksSnap.docs.map(toTask),
    stampTotal: Number(oldStats.data()?.stampTotal) || 0,
    settings: oldSettings.exists() ? oldSettings.data() : null,
  };
  if (!hasLegacyData(legacy) && !oldStats.exists()) return null;

  const sharedTasks = await getDocsFromServer(collection(db, SPACE, "tasks"));
  const sharedStats = await getDocFromServer(doc(db, SPACE, "meta", "stats"));
  const sharedSettings = await getDocFromServer(doc(db, SPACE, "meta", "settings"));
  const plan = planMigration(legacy, {
    taskIds: new Set(sharedTasks.docs.map((d) => d.id)),
    stampTotal: Number(sharedStats.data()?.stampTotal) || 0,
    hasSettings: sharedSettings.exists(),
  });

  // コピーと旧データの削除は同じバッチで行う(途中で切れても、二重にコピーされない)
  const copyIds = new Map(plan.copy.map((t) => [t.id, t]));
  const ids = oldTasksSnap.docs.map((d) => d.id);
  const CHUNK = 200; // 1 件につき set + delete の 2 操作(バッチは 500 操作まで)
  for (let i = 0; i < ids.length; i += CHUNK) {
    const b = writeBatch(db);
    for (const id of ids.slice(i, i + CHUNK)) {
      const t = copyIds.get(id);
      if (t) b.set(doc(db, SPACE, "tasks", id), toData(t));
      b.delete(doc(db, oldBase, "tasks", id));
    }
    await b.commit();
  }
  const b = writeBatch(db);
  if (plan.stampDelta > 0) b.set(doc(db, SPACE, "meta", "stats"), { stampTotal: increment(plan.stampDelta) }, { merge: true });
  if (plan.settings) b.set(doc(db, SPACE, "meta", "settings"), { ...plan.settings });
  b.delete(doc(db, oldBase, "meta", "stats"));
  b.delete(doc(db, oldBase, "meta", "settings"));
  await b.commit();
  return { moved: plan.copy.length, legacy: legacy.tasks.length };
}
