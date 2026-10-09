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
  env: { ...process.env, SOMEDAY_AUTOSEQ: "0,1,2,2", SOMEDAY_AUTOADD: "エミュで  追加|0|1", SOMEDAY_STATE_DIR: join(process.env.TEMP || ".", "someday-emu-state"), SOMEDAY_PIPE: `someday-emu-${process.pid}`, SOMEDAY_SHOT: shot || join(process.env.TEMP || ".", "someday-emu.png") },
  stdio: "inherit", timeout: 60000,
});
assert.equal(r.status, 0);
const got = Object.fromEntries((await col.get()).docs.map((d) => [d.id, d.data()]));
assert.equal(got.b.done, true); assert.equal(got.c.done, true); assert.equal(got.a.done, false);
assert.ok(Number.isInteger(got.b.doneAt)); assert.equal(got.a.doneAt, null);
assert.equal((await stats.get()).data().stampTotal, 2);
console.log("OK 3: ダイアログのチェックで b,c が完了、a は取り消し、stampTotal=2");
// 4) ダイアログからの追加(ADD): アプリ本体と同じ形のドキュメントができる
const added = Object.entries(got).filter(([id]) => !["a", "b", "c", "d"].includes(id));
assert.equal(added.length, 1, "1件追加される");
const [newId, nd] = added[0];
assert.match(newId, /^[A-Za-z0-9]{20}$/, "Firestore の自動ID");
assert.deepEqual(Object.keys(nd).sort(), ["createdAt", "done", "doneAt", "due", "label", "note", "title", "updatedAt"]);
assert.equal(nd.title, "エミュで 追加"); assert.equal(nd.due, ""); assert.equal(nd.label, "work"); assert.equal(nd.note, "");
assert.equal(nd.done, false); assert.equal(nd.doneAt, null);
assert.ok(Number.isInteger(nd.createdAt) && nd.createdAt === nd.updatedAt);
console.log("OK 4: ダイアログから追加 → 自動ID・アプリと同じ8項目・空白は1つにまとまる");

// 5) ダイアログからの編集(EDIT)と削除(DELETE): 一覧は b(期限切れ)・c(来週)・a(期限なし) の順
await seed();
await stats.set({ stampTotal: 7 });
const { editTask, deleteTask } = await import("../fetch.mjs");
await assert.rejects(editTask("nope", { title: "x", updatedAt: 1 }), /gone/);
const before = (await col.doc("b").get()).data();
const r5 = spawnSync(process.execPath, [join(here, "..", "index.mjs")], {
  env: { ...process.env, SOMEDAY_PIPE: `someday-emu5-${process.pid}`, SOMEDAY_STATE_DIR: join(process.env.TEMP || ".", "someday-emu-state"),
    SOMEDAY_SHOT: shot || join(process.env.TEMP || ".", "someday-emu5.png"),
    SOMEDAY_AUTOEDIT: "0|編集後の題名|2026-12-24|2|新しいメモ|save", SOMEDAY_AUTODELETE: "2" },
  stdio: "inherit", timeout: 60000,
});
assert.equal(r5.status, 0);
const got5 = Object.fromEntries((await col.get()).docs.map((d) => [d.id, d.data()]));
assert.equal(got5.a, undefined, "a は削除された(閉じるときに確定)");
assert.deepEqual(Object.keys(got5.b).sort(), ["createdAt", "done", "doneAt", "due", "label", "note", "title", "updatedAt"]);
assert.equal(got5.b.title, "編集後の題名"); assert.equal(got5.b.due, "2026-12-24"); assert.equal(got5.b.label, "private"); assert.equal(got5.b.note, "新しいメモ");
assert.equal(got5.b.done, before.done); assert.equal(got5.b.doneAt, before.doneAt); assert.equal(got5.b.createdAt, before.createdAt);
assert.ok(Number.isInteger(got5.b.updatedAt) && got5.b.updatedAt > before.updatedAt);
assert.equal(got5.c.title, "来週", "触っていないタスクはそのまま");
assert.equal((await stats.get()).data().stampTotal, 7, "編集・削除では stampTotal を変えない");
console.log("OK 5: ダイアログから編集 → title/due/label/note と updatedAt だけ更新(done/createdAt はそのまま)、削除は閉じるときに確定、stampTotal 変化なし");
