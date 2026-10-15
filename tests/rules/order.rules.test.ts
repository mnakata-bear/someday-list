import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

// 手動の並び順 spaces/home/meta/order の検証(Firebase Emulator に対して。本番には接続しない)
let env: RulesTestEnvironment;
const PATH = "spaces/home/meta/order";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-someday",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const member = (uid: string, email: string) => env.authenticatedContext(uid, {
  email, email_verified: true, firebase: { sign_in_provider: "google.com" },
} as never).firestore();
const alice = () => member("alice", "naka.mutora3@gmail.com");
const bob = () => member("bob", "naka.mutora7@gmail.com");
const seed = (data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), PATH), data); });

describe("meta/order(手動の並び順)", () => {
  it("許可アカウントは、2 人とも読み書き・削除できる", async () => {
    await assertSucceeds(setDoc(doc(alice(), PATH), { ids: ["a", "b"], updatedAt: 1 }));
    await assertSucceeds(getDoc(doc(bob(), PATH)));
    await assertSucceeds(setDoc(doc(bob(), PATH), { ids: ["b", "a"], updatedAt: 2 }));
    await assertSucceeds(updateDoc(doc(alice(), PATH), { ids: [], updatedAt: 3 })); // 期限順に戻す
    await assertSucceeds(deleteDoc(doc(bob(), PATH)));
  });
  it("ids はちょうど 1000 件まで。1001 件は拒否", async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    await assertSucceeds(setDoc(doc(alice(), PATH), { ids: mk(1000), updatedAt: 1 }));
    await assertFails(setDoc(doc(alice(), PATH), { ids: mk(1001), updatedAt: 1 }));
  });
  it("形が違う書き込みは拒否(ids が配列でない / updatedAt が整数でない / 余計なキー / キー不足)", async () => {
    const db = alice();
    await assertFails(setDoc(doc(db, PATH), { ids: "a,b", updatedAt: 1 }));
    await assertFails(setDoc(doc(db, PATH), { ids: { 0: "a" }, updatedAt: 1 }));
    await assertFails(setDoc(doc(db, PATH), { ids: null, updatedAt: 1 }));
    await assertFails(setDoc(doc(db, PATH), { ids: ["a"], updatedAt: "1" }));
    await assertFails(setDoc(doc(db, PATH), { ids: ["a"], updatedAt: 1.5 }));
    await assertFails(setDoc(doc(db, PATH), { ids: ["a"], updatedAt: null }));
    await assertFails(setDoc(doc(db, PATH), { ids: ["a"], updatedAt: 1, extra: true }));
    await assertFails(setDoc(doc(db, PATH), { ids: ["a"] }));
    await assertFails(setDoc(doc(db, PATH), { updatedAt: 1 }));
  });
  it("更新でも検証される(余計なキーを足す更新は拒否)", async () => {
    await seed({ ids: ["a"], updatedAt: 1 });
    await assertFails(updateDoc(doc(alice(), PATH), { extra: 1 }));
    await assertFails(updateDoc(doc(alice(), PATH), { ids: "x" }));
    await assertSucceeds(updateDoc(doc(alice(), PATH), { ids: ["a", "b"], updatedAt: 2 }));
  });
  it("未ログイン・許可されていないメール・メール未確認は、読み書き削除すべて拒否", async () => {
    await seed({ ids: ["a"], updatedAt: 1 });
    const other = env.authenticatedContext("carol", { email: "other@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } } as never).firestore();
    const unverified = env.authenticatedContext("dave", { email: "naka.mutora3@gmail.com", email_verified: false, firebase: { sign_in_provider: "google.com" } } as never).firestore();
    for (const db of [env.unauthenticatedContext().firestore(), other, unverified]) {
      await assertFails(getDoc(doc(db, PATH)));
      await assertFails(setDoc(doc(db, PATH), { ids: ["a"], updatedAt: 2 }));
      await assertFails(deleteDoc(doc(db, PATH)));
    }
  });
  it("meta の別名(order2 など)は、従来どおり拒否", async () => {
    await assertFails(setDoc(doc(alice(), "spaces/home/meta/order2"), { ids: [], updatedAt: 1 }));
  });
});
