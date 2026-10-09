import { describe, it, expect } from "vitest";
import { parseLine, encodeB64Json, decodeB64Json, editPatch, validateNote } from "../proto.mjs";
import { createDeferred } from "../pending.mjs";
import { makeHandler } from "../handler.mjs";
import { itemView } from "../logic.mjs";
// アプリ本体の実装と突き合わせる
import { cleanPatch } from "../../src/store/local.ts";
import { validateNote as appNote } from "../../src/core/logic.ts";

describe("EDIT / DELETE / UNDELETE の解析", () => {
  it("EDIT: base64 JSON(改行・空白を含むメモも壊れない)", () => {
    const input = { id: "abc123", title: "あ い\nう", due: "2026-11-30", note: "1行目\n2行目 ", label: "work" };
    expect(parseLine(`EDIT e1 ${encodeB64Json(input)}`)).toEqual({ type: "edit", req: "e1", input });
  });
  it("EDIT: id が無い・不正、壊れた base64 は null", () => {
    expect(parseLine(`EDIT e1 ${encodeB64Json({ title: "x" })}`)).toBeNull();
    expect(parseLine(`EDIT e1 ${encodeB64Json({ id: "../x" })}`)).toBeNull();
    expect(parseLine("EDIT e1 !!!")).toBeNull();
    expect(parseLine("EDIT e1")).toBeNull();
  });
  it("DELETE / UNDELETE", () => {
    expect(parseLine("DELETE abc_1")).toEqual({ type: "delete", id: "abc_1" });
    expect(parseLine("UNDELETE abc_1")).toEqual({ type: "undelete", id: "abc_1" });
    expect(parseLine("DELETE")).toBeNull();
    expect(parseLine("DELETE a/b")).toBeNull();
    expect(parseLine("DELETE a b")).toBeNull();
  });
});

describe("編集で書く内容(アプリ本体 cleanPatch + updatedAt と一致)", () => {
  const ok = [
    { title: "  新しい   題名 ", due: "2026-12-31", note: "メモ\r\n二行目  \n", label: "private" },
    { title: "x", due: "", note: "", label: "" },
    { title: "x" }, { due: "2027-02-28" }, { note: "n" }, { label: "work" },
  ];
  for (const c of ok) {
    it(`同じ値: ${JSON.stringify(c).slice(0, 40)}`, () => {
      const r = editPatch({ id: "i", ...c }, 1760000000999.5);
      expect(r.ok).toBe(true);
      expect(r.value).toEqual({ ...cleanPatch(c), updatedAt: 1760000000999 });
      expect("done" in r.value || "doneAt" in r.value || "createdAt" in r.value).toBe(false);
    });
  }
  const bad = [{ title: "  " }, { title: "あ".repeat(101) }, { due: "2026-02-30" }, { due: "x" }, { note: "n".repeat(2001) }, { label: "home" }];
  for (const c of bad) {
    it(`どちらも弾く: ${JSON.stringify(c).slice(0, 30)}`, () => {
      expect(editPatch({ id: "i", ...c }, 1).ok).toBe(false);
      expect(() => cleanPatch(c)).toThrow();
    });
  }
  it("何も変えない編集は弾く", () => expect(editPatch({ id: "i" }, 1)).toEqual({ ok: false, error: "empty" }));
  it("エラーコード", () => {
    expect(editPatch({ title: "" }, 1).error).toBe("empty");
    expect(editPatch({ title: "あ".repeat(101) }, 1).error).toBe("too-long");
    expect(editPatch({ due: "2026-13-01" }, 1).error).toBe("bad-due");
    expect(editPatch({ note: "n".repeat(2001) }, 1).error).toBe("note-too-long");
  });
  it("メモの整え方がアプリの validateNote と同じ", () => {
    for (const n of ["a\r\nb  ", "a\rb", "  前の空白は残る\n\n", "", "x".repeat(2000)]) expect(validateNote(n).value).toBe(appNote(n).value);
  });
});

describe("削除の保留(元に戻す)", () => {
  function fake() {
    const timers = new Map(); let seq = 0; const committed = []; const errors = [];
    const d = createDeferred({
      delayMs: 6000,
      setT: (fn, ms) => { timers.set(++seq, { fn, ms }); return seq; },
      clearT: (id) => timers.delete(id),
      commit: async (id) => { if (id === "bad") throw new Error("x"); committed.push(id); },
      onError: (id) => errors.push(id),
    });
    return { d, timers, committed, errors, fire: async () => { for (const [k, t] of [...timers]) { timers.delete(k); await t.fn(); } } };
  }
  it("6秒後に確定する(それまでは確定しない)", async () => {
    const f = fake();
    expect(f.d.schedule("a")).toBe(true);
    expect([...f.timers.values()][0].ms).toBe(6000);
    expect(f.committed).toEqual([]);
    await f.fire();
    expect(f.committed).toEqual(["a"]);
    expect(f.d.has("a")).toBe(false);
  });
  it("元に戻すと確定しない", async () => {
    const f = fake();
    f.d.schedule("a");
    expect(f.d.undo("a")).toBe(true);
    await f.fire();
    expect(f.committed).toEqual([]);
  });
  it("確定した後の「元に戻す」は間に合わない(false)", async () => {
    const f = fake();
    f.d.schedule("a"); await f.fire();
    expect(f.d.undo("a")).toBe(false);
  });
  it("同じ id の二重 schedule は1回だけ", async () => {
    const f = fake();
    expect(f.d.schedule("a")).toBe(true); expect(f.d.schedule("a")).toBe(false);
    await f.fire(); expect(f.committed).toEqual(["a"]);
  });
  it("閉じるとき(flush)は、待っているものを全部すぐ確定する", async () => {
    const f = fake();
    f.d.schedule("a"); f.d.schedule("b"); f.d.schedule("c"); f.d.undo("b");
    await f.d.flush();
    expect(f.committed).toEqual(["a", "c"]);
    expect(f.d.size).toBe(0);
    expect(f.timers.size).toBe(0);
  });
  it("確定に失敗したら onError", async () => {
    const f = fake();
    f.d.schedule("bad"); await f.fire();
    expect(f.errors).toEqual(["bad"]);
  });
});

describe("handler: 編集と削除", () => {
  const NOW = new Date("2026-10-09T01:00:00Z").getTime();
  it("EDIT: 書き込んで更新後の1行を返す(完了済みかどうかはそのまま)", async () => {
    const calls = [];
    const h = makeHandler({ demo: false, now: () => NOW, editTask: async (id, patch) => { calls.push([id, patch]); return { title: "旧", due: "", note: "", label: "", done: true, doneAt: 5, createdAt: 77, ...patch }; } });
    const r = await h(`EDIT e1 ${encodeB64Json({ id: "T1", title: " 新 ", due: "2026-10-10", note: "メ", label: "work" })}`);
    expect(calls).toEqual([["T1", { title: "新", due: "2026-10-10", note: "メ", label: "work", updatedAt: NOW }]]);
    const [cmd, req, b64] = r.split(" ");
    expect([cmd, req]).toEqual(["EDITED", "e1"]);
    expect(decodeB64Json(b64)).toMatchObject({ id: "T1", title: "新", dueYmd: "2026-10-10", note: "メ", label: "仕事", ca: 77, done: true });
  });
  it("EDIT: 対象が無ければ gone、検証エラー、保存エラー", async () => {
    const h = makeHandler({ demo: false, now: () => NOW, editTask: async () => { throw new Error("gone"); } });
    expect(await h(`EDIT e1 ${encodeB64Json({ id: "T1", title: "x" })}`)).toBe("EDITERR e1 gone");
    expect(await h(`EDIT e2 ${encodeB64Json({ id: "T1", title: "" })}`)).toBe("EDITERR e2 empty");
    const h2 = makeHandler({ demo: false, now: () => NOW, log: () => {}, editTask: async () => { throw new Error("net"); } });
    expect(await h2(`EDIT e3 ${encodeB64Json({ id: "T1", title: "x" })}`)).toBe("EDITERR e3 save");
  });
  it("--demo の EDIT は書き込まず、渡された値で返す", async () => {
    let n = 0;
    const h = makeHandler({ demo: true, now: () => NOW, editTask: async () => { n++; } });
    const r = await h(`EDIT e1 ${encodeB64Json({ id: "d1", title: "題", due: "2026-10-12", note: "", label: "private", ca: 9 })}`);
    expect(n).toBe(0);
    expect(decodeB64Json(r.split(" ")[2])).toMatchObject({ id: "d1", title: "題", dueYmd: "2026-10-12", label: "プライベート", ca: 9 });
  });
  it("DELETE は保留(すぐには消さない)、UNDELETE で取り消し、flush で確定", async () => {
    const del = [];
    const h = makeHandler({ demo: false, now: () => NOW, holdMs: 10_000_000, deleteTask: async (id) => del.push(id) });
    expect(await h("DELETE a")).toBeNull(); expect(await h("DELETE b")).toBeNull(); expect(await h("DELETE c")).toBeNull();
    expect(del).toEqual([]);
    expect(await h("UNDELETE b")).toBeNull();
    expect(await h("UNDELETE zzz")).toBe("UNDOERR zzz");
    await h.flush();
    expect(del).toEqual(["a", "c"]);
  });
  it("削除の確定に失敗したら push で DELERR", async () => {
    const pushed = [];
    const h = makeHandler({ demo: false, now: () => NOW, log: () => {}, push: (l) => pushed.push(l), deleteTask: async () => { throw new Error("net"); } });
    await h("DELETE a"); await h.flush();
    expect(pushed).toEqual(["DELERR a"]);
  });
  it("--demo の削除は書き込まない", async () => {
    let n = 0;
    const h = makeHandler({ demo: true, now: () => NOW, deleteTask: async () => { n++; } });
    await h("DELETE a"); await h.flush();
    expect(n).toBe(0);
  });
});

describe("itemView に編集用の値が入る", () => {
  it("dueYmd / note / ca / done", () => {
    expect(itemView({ id: "x", title: "t", due: "2026-10-10", note: "メ", label: "work", done: true, createdAt: 5 }, new Date("2026-10-09T01:00:00Z")))
      .toMatchObject({ dueYmd: "2026-10-10", note: "メ", ca: 5, done: true, hasNote: true });
  });
});
