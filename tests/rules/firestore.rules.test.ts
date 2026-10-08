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

// 許可された 2 アカウント(uid もメールも別)
const GOOGLE = { sign_in_provider: "google.com" };
const ALLOWED = { email: "naka.mutora3@gmail.com", email_verified: true, firebase: GOOGLE };
const ALLOWED2 = { email: "naka.mutora7@gmail.com", email_verified: true, firebase: GOOGLE };
const alice = () => env.authenticatedContext("alice", ALLOWED).firestore();
const bob = () => env.authenticatedContext("bob", ALLOWED2).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path), data); });

describe("共有スペース spaces/home を 2 アカウントで読み書きできる", () => {
  it("1 つ目のアカウントが作ったタスクを、2 つ目のアカウントが読み・更新・削除できる", async () => {
    await assertSucceeds(setDoc(doc(alice(), "spaces/home/tasks/t1"), task()));
    const db = bob();
    await assertSucceeds(getDoc(doc(db, "spaces/home/tasks/t1")));
    await assertSucceeds(getDocs(collection(db, "spaces/home/tasks")));
    await assertSucceeds(updateDoc(doc(db, "spaces/home/tasks/t1"), { done: true, doneAt: 123, updatedAt: 2 }));
    await assertSucceeds(setDoc(doc(db, "spaces/home/tasks/t2"), task()));
    await assertSucceeds(deleteDoc(doc(db, "spaces/home/tasks/t1")));
    await assertSucceeds(getDocs(collection(alice(), "spaces/home/tasks")));
  });
  it("設定とスタンプ累計も両方のアカウントで読み書きできる", async () => {
    await assertSucceeds(setDoc(doc(alice(), "spaces/home/meta/settings"), { layout: "a", theme: "penguin", wp: "none", stamp: "sumi" }));
    await assertSucceeds(setDoc(doc(bob(), "spaces/home/meta/settings"), { layout: "c", theme: "wine", wp: "none", stamp: "done" }));
    await assertSucceeds(getDoc(doc(alice(), "spaces/home/meta/settings")));
    await assertSucceeds(setDoc(doc(alice(), "spaces/home/meta/stats"), { stampTotal: increment(1) }, { merge: true }));
    await assertSucceeds(setDoc(doc(bob(), "spaces/home/meta/stats"), { stampTotal: increment(1) }, { merge: true }));
    await assertSucceeds(getDoc(doc(bob(), "spaces/home/meta/stats")));
  });
  it("未ログインは何もできない", async () => {
    await seed("spaces/home/tasks/t1", task());
    const db = anon();
    await assertFails(getDoc(doc(db, "spaces/home/tasks/t1")));
    await assertFails(getDocs(collection(db, "spaces/home/tasks")));
    await assertFails(setDoc(doc(db, "spaces/home/tasks/t2"), task()));
    await assertFails(deleteDoc(doc(db, "spaces/home/tasks/t1")));
    await assertFails(getDoc(doc(db, "spaces/home/meta/settings")));
    await assertFails(setDoc(doc(db, "spaces/home/meta/stats"), { stampTotal: 1 }));
  });
  it("spaces/home 以外のスペースや、決まっていない場所は拒否", async () => {
    await assertFails(setDoc(doc(alice(), "spaces/other/tasks/t1"), task()));
    await assertFails(getDoc(doc(alice(), "spaces/other/tasks/t1")));
    await assertFails(setDoc(doc(alice(), "spaces/home"), { a: 1 }));
    await assertFails(getDoc(doc(alice(), "spaces/home")));
    await assertFails(setDoc(doc(alice(), "spaces/home/other/x"), { a: 1 }));
    await assertFails(setDoc(doc(alice(), "other/x"), { a: 1 }));
  });
});

describe("許可されたメールだけが使える", () => {
  it("許可されていないメールは、共有スペースを読み書きできない", async () => {
    await seed("spaces/home/tasks/t1", task());
    const db = env.authenticatedContext("carol", { email: "other@example.com", email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, "spaces/home/tasks/t1")));
    await assertFails(getDocs(collection(db, "spaces/home/tasks")));
    await assertFails(setDoc(doc(db, "spaces/home/tasks/t2"), task()));
    await assertFails(updateDoc(doc(db, "spaces/home/tasks/t1"), { title: "x" }));
    await assertFails(deleteDoc(doc(db, "spaces/home/tasks/t1")));
    await assertFails(getDoc(doc(db, "spaces/home/meta/settings")));
    await assertFails(setDoc(doc(db, "spaces/home/meta/settings"), { layout: "a", theme: "penguin", wp: "none", stamp: "sumi" }));
    await assertFails(setDoc(doc(db, "spaces/home/meta/stats"), { stampTotal: 1 }));
  });
  it("email_verified が false なら、許可メールでも読み書きできない", async () => {
    await seed("spaces/home/tasks/t1", task());
    for (const email of [ALLOWED.email, ALLOWED2.email]) {
      const db = env.authenticatedContext("alice", { email, email_verified: false }).firestore();
      await assertFails(getDoc(doc(db, "spaces/home/tasks/t1")));
      await assertFails(getDocs(collection(db, "spaces/home/tasks")));
      await assertFails(setDoc(doc(db, "spaces/home/tasks/t2"), task()));
      await assertFails(deleteDoc(doc(db, "spaces/home/tasks/t1")));
      await assertFails(getDoc(doc(db, "spaces/home/meta/stats")));
    }
  });
  it("メールの無いトークンも読み書きできない", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(db, "spaces/home/tasks/t1")));
    await assertFails(setDoc(doc(db, "spaces/home/tasks/t1"), task()));
  });
});

describe("旧データ users/{uid} は本人の read と delete だけ(移行用)", () => {
  beforeEach(async () => {
    await seed("users/alice/tasks/t1", task());
    await seed("users/alice/meta/settings", { layout: "a", theme: "penguin", wp: "none", stamp: "sumi" });
    await seed("users/alice/meta/stats", { stampTotal: 3 });
  });
  it("本人は読めて、消せる", async () => {
    const db = alice();
    await assertSucceeds(getDocs(collection(db, "users/alice/tasks")));
    await assertSucceeds(getDoc(doc(db, "users/alice/meta/settings")));
    await assertSucceeds(getDoc(doc(db, "users/alice/meta/stats")));
    await assertSucceeds(deleteDoc(doc(db, "users/alice/tasks/t1")));
    await assertSucceeds(deleteDoc(doc(db, "users/alice/meta/settings")));
    await assertSucceeds(deleteDoc(doc(db, "users/alice/meta/stats")));
  });
  it("本人でも書き込み(作成・更新)はできない", async () => {
    const db = alice();
    await assertFails(setDoc(doc(db, "users/alice/tasks/t2"), task()));
    await assertFails(setDoc(doc(db, "users/alice/tasks/t1"), task({ title: "上書き" })));
    await assertFails(updateDoc(doc(db, "users/alice/tasks/t1"), { title: "更新" }));
    await assertFails(setDoc(doc(db, "users/alice/meta/stats"), { stampTotal: 99 }));
    await assertFails(setDoc(doc(db, "users/alice/meta/settings"), { layout: "c", theme: "penguin", wp: "none", stamp: "sumi" }));
    await assertFails(setDoc(doc(db, "users/alice"), { a: 1 }));
  });
  it("もう一方の許可アカウント(別 uid)は読めない・消せない", async () => {
    const db = bob();
    await assertFails(getDoc(doc(db, "users/alice/tasks/t1")));
    await assertFails(getDocs(collection(db, "users/alice/tasks")));
    await assertFails(deleteDoc(doc(db, "users/alice/tasks/t1")));
    await assertFails(getDoc(doc(db, "users/alice/meta/stats")));
  });
  it("許可外メール・未確認メール・未ログインは、同じ uid でも読めない・消せない", async () => {
    for (const db of [
      env.authenticatedContext("alice", { email: "other@example.com", email_verified: true }).firestore(),
      env.authenticatedContext("alice", { email: ALLOWED.email, email_verified: false }).firestore(),
      anon(),
    ]) {
      await assertFails(getDoc(doc(db, "users/alice/tasks/t1")));
      await assertFails(getDocs(collection(db, "users/alice/tasks")));
      await assertFails(deleteDoc(doc(db, "users/alice/tasks/t1")));
      await assertFails(setDoc(doc(db, "users/alice/tasks/t2"), task()));
    }
  });
});

describe("フィールドの検証", () => {
  const ref = () => doc(alice(), "spaces/home/tasks/t1");
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
    const s = doc(alice(), "spaces/home/meta/settings");
    await assertSucceeds(setDoc(s, { layout: "c", theme: "midnight", wp: "aurora", stamp: "done" }));
    await assertFails(setDoc(s, { layout: "x", theme: "midnight", wp: "aurora", stamp: "done" }));
    await assertFails(setDoc(s, { layout: "a", theme: "midnight", wp: "aurora", stamp: "done", photo: "data:..." }));
  });
  it("stats.stampTotal は 0 以上の整数(increment も)", async () => {
    const s = doc(alice(), "spaces/home/meta/stats");
    await assertSucceeds(setDoc(s, { stampTotal: increment(1) }, { merge: true }));
    await assertSucceeds(setDoc(s, { stampTotal: increment(-1) }, { merge: true }));
    await assertFails(setDoc(s, { stampTotal: increment(-1) }, { merge: true })); // 0 未満
    await assertFails(setDoc(s, { stampTotal: 1.5 }));
  });
});

describe("Google 以外のサインイン方法", () => {
  it("許可メールでも、匿名やメール/パスワードのログインは拒否される", async () => {
    for (const provider of ["anonymous", "password", "custom"]) {
      const db = env.authenticatedContext("dave", { email: "naka.mutora3@gmail.com", email_verified: true, firebase: { sign_in_provider: provider } }).firestore();
      await assertFails(getDoc(doc(db, "spaces/home/tasks/t1")));
      await assertFails(setDoc(doc(db, "spaces/home/tasks/t1"), task()));
    }
  });
});
