// エミュレータ専用の確認: テストデータを入れて fetchPendingTasks を通す(本番には接続しない)
//   cd .. && firebase emulators:exec --only firestore --project demo-someday "node notify/test/emulator-check.mjs"
import assert from "node:assert/strict";
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("FIRESTORE_EMULATOR_HOST が未設定です。エミュレータ内でのみ実行できます"); process.exit(2); }
const { initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { fetchPendingTasks } = await import("../fetch.mjs");
const { buildView } = await import("../logic.mjs");

const db = getFirestore(initializeApp({ projectId: "demo-someday" }, "seed"));
const col = db.collection("spaces").doc("home").collection("tasks");
const base = { note: "", label: "", done: false, doneAt: null, createdAt: 1, updatedAt: 1 };
await col.doc("a").set({ ...base, title: "期限なし", due: "" });
await col.doc("b").set({ ...base, title: "期限切れ", due: "2026-10-01", label: "work", note: "メモ" });
await col.doc("c").set({ ...base, title: "来週", due: "2026-10-16", label: "private" });
await col.doc("d").set({ ...base, title: "完了済み", due: "2026-10-02", done: true, doneAt: 5 });

const tasks = await fetchPendingTasks();
assert.equal(tasks.length, 3, "完了済みは除かれる");
const v = buildView(tasks, new Date("2026-10-09T01:00:00Z"));
assert.deepEqual(v.items.map((i) => i.title), ["期限切れ", "来週", "期限なし"]);
assert.equal(v.items[0].dueCls, "over");
console.log("OK: 取得 3 件(完了済み除外)、並び順 期限切れ→来週→期限なし");
