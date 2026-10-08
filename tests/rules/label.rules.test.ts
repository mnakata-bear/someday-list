import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

// label フィールドの検証(Firebase Emulator に対して。本番には接続しない)
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

const db = () => env.authenticatedContext("alice", {
  email: "naka.mutora3@gmail.com", email_verified: true, firebase: { sign_in_provider: "google.com" },
} as never).firestore();

describe("タスクの label", () => {
  it("work / private / 空文字 / キー無し は作成できる", async () => {
    for (const [i, p] of [{ label: "work" }, { label: "private" }, { label: "" }, {}].entries()) {
      await assertSucceeds(setDoc(doc(db(), `spaces/home/tasks/ok${i}`), task(p)));
    }
  });
  it("許可値以外(別の文字列・数値・null・大文字)は作成できない", async () => {
    for (const [i, v] of ["hobby", "Work", "work ", 1, null, true].entries()) {
      await assertFails(setDoc(doc(db(), `spaces/home/tasks/ng${i}`), task({ label: v })));
    }
  });
  it("更新でラベルを付ける・変える・外すことはできるが、不正な値には変えられない", async () => {
    await assertSucceeds(setDoc(doc(db(), "spaces/home/tasks/t1"), task()));
    await assertSucceeds(updateDoc(doc(db(), "spaces/home/tasks/t1"), { label: "work", updatedAt: 2 }));
    await assertSucceeds(updateDoc(doc(db(), "spaces/home/tasks/t1"), { label: "private", updatedAt: 3 }));
    await assertSucceeds(updateDoc(doc(db(), "spaces/home/tasks/t1"), { label: "", updatedAt: 4 }));
    await assertFails(updateDoc(doc(db(), "spaces/home/tasks/t1"), { label: "hobby", updatedAt: 5 }));
  });
  it("label 以外の知らないキーは、これまでどおり作成できない", async () => {
    await assertFails(setDoc(doc(db(), "spaces/home/tasks/x"), task({ labels: "work" })));
  });
});
