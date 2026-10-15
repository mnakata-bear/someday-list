import { beforeEach, describe, expect, it } from "vitest";
import { mergeVisibleOrder, moveTaskId, normalizeOrder, sortTasksManual } from "../../src/core/logic";
import type { Task } from "../../src/core/types";
import { LocalStore, ORDER_KEY } from "../../src/store/local";

const task = (p: Partial<Task> & { id: string }): Task => ({ title: p.id, due: "", note: "", label: "", done: false, doneAt: null, createdAt: 0, updatedAt: 0, ...p });
const ids = (ts: Task[]) => ts.map((t) => t.id);

// 従来順(sortTasks): 未完了 → 期限の近い順(なしは後ろ) → 作成順 / 完了は最後
const TS = [
  task({ id: "a", due: "2026-12-01" }),
  task({ id: "b", due: "2026-11-01" }),
  task({ id: "c", createdAt: 1 }),
  task({ id: "d", createdAt: 2 }),
  task({ id: "x", done: true, due: "2026-10-01" }),
  task({ id: "y", done: true, due: "2026-10-02" }),
];

describe("sortTasksManual", () => {
  it("order が空なら、従来の sortTasks と同じ", () => {
    expect(ids(sortTasksManual(TS, []))).toEqual(["b", "a", "c", "d", "x", "y"]);
  });
  it("手動順があれば、グループの中で ids の並びを優先する(未完了→完了は維持)", () => {
    expect(ids(sortTasksManual(TS, ["d", "c", "a", "b", "y", "x"]))).toEqual(["d", "c", "a", "b", "y", "x"]);
    // 完了を先頭に書いても、未完了のグループが先
    expect(ids(sortTasksManual(TS, ["y", "x", "d", "c", "a", "b"]))).toEqual(["d", "c", "a", "b", "y", "x"]);
  });
  it("ids に無い(新しい)タスクは、グループの先頭に従来順で置く", () => {
    expect(ids(sortTasksManual(TS, ["d", "a"]))).toEqual(["b", "c", "d", "a", "x", "y"]);
    expect(ids(sortTasksManual(TS, ["y"]))).toEqual(["b", "a", "c", "d", "x", "y"]);
  });
  it("存在しない id は無視する / 重複は最初の位置を使う", () => {
    expect(ids(sortTasksManual(TS, ["zzz", "c", "c", "a", "b", "d"]))).toEqual(["c", "a", "b", "d", "x", "y"]);
  });
  it("完了にしたタスクも、完了グループの中で手動順に従う / 元に戻すと元の位置へ", () => {
    const order = ["d", "c", "a", "b"];
    const done = TS.map((t) => (t.id === "c" ? { ...t, done: true } : t));
    expect(ids(sortTasksManual(done, order))).toEqual(["d", "a", "b", "x", "y", "c"]);
    expect(ids(sortTasksManual(TS, order))).toEqual(["d", "c", "a", "b", "x", "y"]);
  });
  it("元の配列は変えない", () => {
    const before = ids(TS);
    sortTasksManual(TS, ["d"]);
    expect(ids(TS)).toEqual(before);
  });
});

describe("moveTaskId", () => {
  const vis = sortTasksManual(TS, []);
  it("同じグループの to 番目へ動かす", () => {
    expect(moveTaskId(vis, "d", 0)).toEqual(["d", "b", "a", "c", "x", "y"]);
    expect(moveTaskId(vis, "b", 2)).toEqual(["a", "c", "b", "d", "x", "y"]);
    expect(moveTaskId(vis, "y", 0)).toEqual(["b", "a", "c", "d", "y", "x"]);
  });
  it("範囲外は端に寄せ、グループをまたがない", () => {
    expect(moveTaskId(vis, "b", 99)).toEqual(["a", "c", "d", "b", "x", "y"]);
    expect(moveTaskId(vis, "x", -5)).toEqual(["b", "a", "c", "d", "x", "y"]);
  });
  it("見えていない id なら、そのまま", () => {
    expect(moveTaskId(vis, "nope", 0)).toEqual(ids(vis));
  });
});

describe("mergeVisibleOrder(絞り込み中の並べ替えを全体へ反映)", () => {
  const all = [
    task({ id: "w1", label: "work", createdAt: 1 }),
    task({ id: "p1", label: "private", createdAt: 2 }),
    task({ id: "w2", label: "work", createdAt: 3 }),
    task({ id: "p2", label: "private", createdAt: 4 }),
    task({ id: "w3", label: "work", createdAt: 5, done: true }),
  ];
  it("見えていない項目の位置は変えず、見えている項目の相対順だけ入れ替える", () => {
    // 全体の今の順: w1 p1 w2 p2 w3。work だけ見えていて、w2 を先頭へ
    const next = mergeVisibleOrder(all, [], ["w2", "w1", "w3"]);
    expect(next).toEqual(["w2", "p1", "w1", "p2", "w3"]);
  });
  it("全タスク(完了を含む)の id を返す。保存後の表示順は新しい順になる", () => {
    const next = mergeVisibleOrder(all, [], ["p2", "p1"]);
    expect(next).toHaveLength(all.length);
    expect(ids(sortTasksManual(all, next))).toEqual(["w1", "p2", "w2", "p1", "w3"]);
  });
  it("手動順が既にあるときは、それを土台にする", () => {
    const next = mergeVisibleOrder(all, ["p2", "w2", "p1", "w1", "w3"], ["w1", "w2"]);
    expect(next).toEqual(["p2", "w1", "p1", "w2", "w3"]);
  });
  it("存在しない id が混じっても落ちない", () => {
    expect(mergeVisibleOrder(all, [], ["w2", "ghost", "w1"])).toEqual(["w2", "p1", "w1", "p2", "w3"]);
  });
  it("最大1000件に切る", () => {
    const many = Array.from({ length: 1200 }, (_, i) => task({ id: `t${i}`, createdAt: i }));
    expect(mergeVisibleOrder(many, [], ids(many))).toHaveLength(1000);
  });
});

describe("normalizeOrder", () => {
  it("文字列(64文字以内)だけ・重複なし・最大1000件。壊れた値は []", () => {
    expect(normalizeOrder(["a", "b", "a", 1, null, "", "x".repeat(65), "y".repeat(64)])).toEqual(["a", "b", "y".repeat(64)]);
    expect(normalizeOrder(Array.from({ length: 1500 }, (_, i) => `i${i}`))).toHaveLength(1000);
    for (const bad of [undefined, null, "a", 1, {}, { 0: "a" }]) expect(normalizeOrder(bad)).toEqual([]);
  });
});

class MemStorage implements Storage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

describe("LocalStore の並び順", () => {
  let mem: MemStorage;
  beforeEach(() => { mem = new MemStorage(); });
  const read = (s: LocalStore) => { let got: string[] = ["?"]; s.subscribeOrder((v) => { got = v; })(); return got; };

  it("未保存なら [] / 保存すると { ids, updatedAt } の形で持ち、読み出せる", () => {
    const s = new LocalStore(mem, () => 777);
    expect(read(s)).toEqual([]);
    s.saveOrder(["b", "a"]);
    expect(JSON.parse(mem.getItem(ORDER_KEY)!)).toEqual({ ids: ["b", "a"], updatedAt: 777 });
    expect(read(new LocalStore(mem))).toEqual(["b", "a"]);
  });
  it("空で保存すると手動順なし / 壊れた値は [] / 購読者へすぐ届く", () => {
    const s = new LocalStore(mem);
    const seen: string[][] = [];
    s.subscribeOrder((v) => seen.push(v));
    s.saveOrder(["a"]);
    s.saveOrder([]);
    expect(seen).toEqual([[], ["a"], []]);
    mem.setItem(ORDER_KEY, "{broken");
    expect(read(new LocalStore(mem))).toEqual([]);
    mem.setItem(ORDER_KEY, JSON.stringify({ ids: "nope" }));
    expect(read(new LocalStore(mem))).toEqual([]);
  });
});
