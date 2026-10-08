import { beforeEach, describe, expect, it } from "vitest";
import { diffTasks, filterTasks, labelCounts, normalizeFilter, normalizeLabel, validateLabel } from "../../src/core/logic";
import { planMigration } from "../../src/core/migration";
import { LocalStore, TASKS_KEY } from "../../src/store/local";
import type { Task } from "../../src/core/types";

const task = (p: Partial<Task> & { id: string }): Task => ({ title: p.id, due: "", note: "", label: "", done: false, doneAt: null, createdAt: 0, updatedAt: 0, ...p });
const sample = [task({ id: "a", label: "work" }), task({ id: "b", label: "private" }), task({ id: "c", label: "work", done: true }), task({ id: "d" })];

describe("ラベルの絞り込みと件数", () => {
  it("すべて/仕事/プライベートで絞り込める(未設定は「すべて」だけ)", () => {
    expect(filterTasks(sample, "all").map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(filterTasks(sample, "work").map((t) => t.id)).toEqual(["a", "c"]);
    expect(filterTasks(sample, "private").map((t) => t.id)).toEqual(["b"]);
  });
  it("件数は完了済みも含めて数える", () => {
    expect(labelCounts(sample)).toEqual({ all: 4, work: 2, private: 1 });
    expect(labelCounts([])).toEqual({ all: 0, work: 0, private: 0 });
  });
  it("保存された絞り込みが壊れていたら「すべて」", () => {
    expect(normalizeFilter("work")).toBe("work");
    expect(normalizeFilter("private")).toBe("private");
    expect(normalizeFilter("x")).toBe("all");
    expect(normalizeFilter(null)).toBe("all");
  });
});

describe("ラベルの検証", () => {
  it("work / private / 空 / 未指定は通り、それ以外はエラー", () => {
    expect(validateLabel("work")).toEqual({ ok: true, value: "work" });
    expect(validateLabel("private")).toEqual({ ok: true, value: "private" });
    expect(validateLabel("")).toEqual({ ok: true, value: "" });
    expect(validateLabel(undefined)).toEqual({ ok: true, value: "" });
    expect(validateLabel("hobby").ok).toBe(false);
    expect(validateLabel(1).ok).toBe(false);
  });
  it("読み込み時は不明な値を未設定に寄せる", () => {
    expect(normalizeLabel("work")).toBe("work");
    expect(normalizeLabel("hobby")).toBe("");
    expect(normalizeLabel(undefined)).toBe("");
  });
});

describe("LocalStore とラベル", () => {
  class Mem implements Storage {
    m = new Map<string, string>();
    get length() { return this.m.size; }
    clear() { this.m.clear(); }
    getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
    key(i: number) { return [...this.m.keys()][i] ?? null; }
    removeItem(k: string) { this.m.delete(k); }
    setItem(k: string, v: string) { this.m.set(k, String(v)); }
  }
  let mem: Mem;
  beforeEach(() => { mem = new Mem(); });

  it("ラベル付きで追加・変更・解除でき、再読み込みしても残る", () => {
    const s = new LocalStore(mem);
    const t = s.add({ title: "資料づくり", due: "", label: "work" });
    expect(t.label).toBe("work");
    s.update(t.id, { label: "private" });
    expect(new LocalStore(mem).snapshot().tasks[0].label).toBe("private");
    s.update(t.id, { label: "" });
    expect(new LocalStore(mem).snapshot().tasks[0].label).toBe("");
  });
  it("ラベル指定なしは未設定、不正なラベルは追加も更新も拒否", () => {
    const s = new LocalStore(mem);
    const t = s.add({ title: "x", due: "" });
    expect(t.label).toBe("");
    expect(() => s.add({ title: "y", due: "", label: "hobby" as never })).toThrow();
    expect(() => s.update(t.id, { label: "hobby" as never })).toThrow();
  });
  it("label の無い既存データも未設定として読める", () => {
    mem.setItem(TASKS_KEY, JSON.stringify({ tasks: [{ id: "old", title: "古い", due: "", note: "", done: false, doneAt: null, createdAt: 1, updatedAt: 1 }], stampTotal: 0 }));
    expect(new LocalStore(mem).snapshot().tasks[0]).toMatchObject({ id: "old", label: "" });
  });
});

describe("他端末の変更検出と移行", () => {
  it("ラベルだけの変更も検出する", () => {
    const a = task({ id: "a" });
    expect(diffTasks([a], [{ ...a, label: "work" }])?.ids).toEqual(["a"]);
  });
  it("移行: 正しいラベルは移し、不正なラベルのタスクは移さない", () => {
    const plan = planMigration(
      { tasks: [task({ id: "ok", label: "work" }), task({ id: "bad", label: "hobby" as never })], stampTotal: 0, settings: null },
      { taskIds: new Set(), stampTotal: 0, hasSettings: false },
    );
    expect(plan.copy.map((t) => t.id)).toEqual(["ok"]);
  });
});
