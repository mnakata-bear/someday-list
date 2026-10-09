// エミュレータ専用の確認(本番には接続しない)。リポジトリ直下で:
//   firebase emulators:exec --only firestore --project demo-someday "node notify/test/emulator-check.mjs"
// 1) 取得と並び順  2) setDone の書き込み内容  3) ダイアログ経由(自動でチェックを押す)で書き込まれること
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("FIRESTORE_EMULATOR_HOST が未設定です。エミュレータ内でのみ実行できます"); process.exit(2); }
const { initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { fetchPendingTasks, setDone } = await import("../fetch.mjs");
const { buildView } = await import("../logic.mjs");

const db = getFirestore(initializeApp({ projectId: "demo-someday" }, "seed"));
const col = db.collection("spaces").doc("home").collection("tasks");
const stats = db.collection("spaces").doc("home").collection("meta").doc("stats");
const base = { note: "", label: "", done: false, doneAt: null, createdAt: 1, updatedAt: 1 };
async function seed() {
  for (const d of (await col.get()).docs) await d.ref.delete();
  await stats.delete();
  await col.doc("a").set({ ...base, title: "期限なし", due: "" });
  await col.doc("b").set({ ...base, title: "期限切れ", due: "2026-10-01", label: "work", note: "メモ" });
  await col.doc("c").set({ ...base, title: "来週", due: "2026-10-16", label: "private" });
  await col.doc("d").set({ ...base, title: "完了済み", due: "2026-10-02", done: true, doneAt: 5 });
}

// 1) 取得
await seed();
const tasks = await fetchPendingTasks();
assert.equal(tasks.length, 3, "完了済みは除かれる");
const v = buildView(tasks, new Date("2026-10-09T01:00:00Z"));
assert.deepEqual(v.items.map((i) => i.title), ["期限切れ", "来週", "期限なし"]);
console.log("OK 1: 取得 3 件(完了済み除外)、並び順 期限切れ→来週→期限なし");

// 2) setDone
const t0 = Date.now();
assert.equal(await setDone("a", true), "ok");
let a = (await col.doc("a").get()).data();
assert.equal(a.done, true); assert.ok(Number.isInteger(a.doneAt) && a.doneAt >= t0); assert.equal(a.updatedAt, a.doneAt);
assert.equal((await stats.get()).data().stampTotal, 1, "stats が無くても作られて 1");
assert.equal(await setDone("a", true), "same", "同じ状態なら何もしない");
assert.equal((await stats.get()).data().stampTotal, 1);
assert.equal(await setDone("a", false), "ok");
a = (await col.doc("a").get()).data();
assert.equal(a.done, false); assert.equal(a.doneAt, null);
assert.equal((await stats.get()).data().stampTotal, 0);
await setDone("d", false); // 完了済みを戻す。累計 0 → 0 のまま
assert.equal((await stats.get()).data().stampTotal, 0, "0 未満にしない");
await assert.rejects(setDone("nope", true));
console.log("OK 2: done/doneAt/updatedAt と stampTotal(+1/-1/0未満にしない/二重に数えない)");

// 3) ダイアログ経由: 行0(期限切れ)・行1(来週)・行2(期限なし)を完了 → 行2を取り消し
await seed();
const here = dirname(fileURLToPath(import.meta.url));
const shot = process.env.SOMEDAY_SHOT_DIR ? join(process.env.SOMEDAY_SHOT_DIR, "emu.png") : "";
const r = spawnSync(process.execPath, [join(here, "..", "index.mjs")], {
  env: { ...process.env, SOMEDAY_AUTOSEQ: "0,1,2,2", SOMEDAY_SHOT: shot || join(process.env.TEMP || ".", "someday-emu.png") },
  stdio: "inherit", timeout: 60000,
});
assert.equal(r.status, 0);
const got = Object.fromEntries((await col.get()).docs.map((d) => [d.id, d.data()]));
assert.equal(got.b.done, true); assert.equal(got.c.done, true); assert.equal(got.a.done, false);
assert.ok(Number.isInteger(got.b.doneAt)); assert.equal(got.a.doneAt, null);
assert.equal((await stats.get()).data().stampTotal, 2);
console.log("OK 3: ダイアログのチェックで b,c が完了、a は取り消し、stampTotal=2");
