import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, increment, setDoc, updateDoc } from "firebase/firestore";

// Firebase Emulator(firestore:8080)に対して firestore.rules を検証する。本番には接続しない。
let env: RulesTestEnvironment;
const task = (p: Record<string, unknown> = {}) => ({ title: "やること", due: "", note: "", done: false, doneAt: null, createdAt: 1, updatedAt: 1, ...p });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-someday",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

// 許可されたメール(alice / bob とも同じメールで uid だけ違う)
const ALLOWED = { email: "naka.mutora3@gmail.com", email_verified: true };
const alice = () => env.authenticatedContext("alice", ALLOWED).firestore();
const bob = () => env.authenticatedContext("bob", ALLOWED).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("本人だけが読み書きできる", () => {
  it("本人はタスクを作成・読み取り・更新・削除できる", async () => {
    const db = alice();
    const ref = doc(db, "users/alice/tasks/t1");
    await assertSucceeds(setDoc(ref, task()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(db, "users/alice/tasks")));
    await assertSucceeds(updateDoc(ref, { done: true, doneAt: 123, updatedAt: 2 }));
    await assertSucceeds(deleteDoc(ref));
  });
  it("他人(別の uid)のデータは読めない・書けない", async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "users/alice/tasks/t1"), task()); });
    const db = bob();
    await assertFails(getDoc(doc(db, "users/alice/tasks/t1")));
    await assertFails(getDocs(collection(db, "users/alice/tasks")));
    await assertFails(setDoc(doc(db, "users/alice/tasks/t2"), task()));
    await assertFails(updateDoc(doc(db, "users/alice/tasks/t1"), { title: "乗っ取り" }));
    await assertFails(deleteDoc(doc(db, "users/alice/tasks/t1")));
    await assertFails(getDoc(doc(db, "users/alice/meta/settings")));
    await assertFails(setDoc(doc(db, "users/alice/meta/stats"), { stampTotal: 99 }));
  });
  it("未ログインは何もできない", async () => {
    const db = anon();
    await assertFails(getDoc(doc(db, "users/alice/tasks/t1")));
    await assertFails(setDoc(doc(db, "users/alice/tasks/t1"), task()));
  });
  it("users/{uid} の外は拒否", async () => {
    await assertFails(setDoc(doc(alice(), "other/x"), { a: 1 }));
    await assertFails(getDoc(doc(alice(), "users/alice")));
  });
});

describe("許可されたメールだけが使える", () => {
  it("許可されていないメールは、自分の uid でも読み書きできない", async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "users/carol/tasks/t1"), task()); });
    const db = env.authenticatedContext("carol", { email: "other@example.com", email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, "users/carol/tasks/t1")));
    await assertFails(getDocs(collection(db, "users/carol/tasks")));
    await assertFails(setDoc(doc(db, "users/carol/tasks/t2"), task()));
    await assertFails(updateDoc(doc(db, "users/carol/tasks/t1"), { title: "x" }));
    await assertFails(deleteDoc(doc(db, "users/carol/tasks/t1")));
    await assertFails(getDoc(doc(db, "users/carol/meta/settings")));
    await assertFails(setDoc(doc(db, "users/carol/meta/settings"), { layout: "a", theme: "penguin", wp: "none", stamp: "sumi" }));
    await assertFails(setDoc(doc(db, "users/carol/meta/stats"), { stampTotal: 1 }));
  });
  it("email_verified が false なら、許可メールでも読み書きできない", async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "users/alice/tasks/t1"), task()); });
    const db = env.authenticatedContext("alice", { email: "naka.mutora3@gmail.com", email_verified: false }).firestore();
    await assertFails(getDoc(doc(db, "users/alice/tasks/t1")));
    await assertFails(setDoc(doc(db, "users/alice/tasks/t2"), task()));
    await assertFails(deleteDoc(doc(db, "users/alice/tasks/t1")));
  });
  it("メールの無いトークンも読み書きできない", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(db, "users/alice/tasks/t1")));
    await assertFails(setDoc(doc(db, "users/alice/tasks/t1"), task()));
  });
});

describe("フィールドの検証", () => {
  const ref = () => doc(alice(), "users/alice/tasks/t1");
  it("title は 1〜100 字", async () => {
    await assertFails(setDoc(ref(), task({ title: "" })));
    await assertSucceeds(setDoc(ref(), task({ title: "あ".repeat(100) })));
    await assertFails(setDoc(ref(), task({ title: "あ".repeat(101) })));
    await assertFails(setDoc(ref(), task({ title: 123 })));
  });
  it("due は '' か YYYY-MM-DD", async () => {
    await assertSucceeds(setDoc(ref(), task({ due: "2026-10-20" })));
    await assertFails(setDoc(ref(), task({ due: "来週" })));
  });
  it("note は string かつ 2000 字以内", async () => {
    await assertSucceeds(setDoc(ref(), task({ note: "x".repeat(2000) })));
    await assertFails(setDoc(ref(), task({ note: "x".repeat(2001) })));
    await assertFails(setDoc(ref(), task({ note: 5 })));
  });
  it("型と余計なフィールド", async () => {
    await assertFails(setDoc(ref(), task({ done: "yes" })));
    await assertFails(setDoc(ref(), task({ createdAt: "now" })));
    await assertFails(setDoc(ref(), task({ evil: true })));
    const { title: _t, ...noTitle } = task();
    await assertFails(setDoc(ref(), noTitle));
  });
  it("settings は決まった値だけ", async () => {
    const s = doc(alice(), "users/alice/meta/settings");
    await assertSucceeds(setDoc(s, { layout: "c", theme: "midnight", wp: "aurora", stamp: "done" }));
    await assertFails(setDoc(s, { layout: "x", theme: "midnight", wp: "aurora", stamp: "done" }));
    await assertFails(setDoc(s, { layout: "a", theme: "midnight", wp: "aurora", stamp: "done", photo: "data:..." }));
  });
  it("stats.stampTotal は 0 以上の整数(increment も)", async () => {
    const s = doc(alice(), "users/alice/meta/stats");
    await assertSucceeds(setDoc(s, { stampTotal: increment(1) }, { merge: true }));
    await assertSucceeds(setDoc(s, { stampTotal: increment(-1) }, { merge: true }));
    await assertFails(setDoc(s, { stampTotal: increment(-1) }, { merge: true })); // 0 未満
    await assertFails(setDoc(s, { stampTotal: 1.5 }));
  });
});
