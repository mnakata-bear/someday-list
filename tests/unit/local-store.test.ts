import { beforeEach, describe, expect, it } from "vitest";
import { LocalStore, SETTINGS_KEY, TASKS_KEY } from "../../src/store/local";
import type { StoreState } from "../../src/store/types";

class MemStorage implements Storage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

let mem: MemStorage;
let clock = 1000;
const mk = () => new LocalStore(mem, () => ++clock);
beforeEach(() => { mem = new MemStorage(); clock = 1000; });

describe("LocalStore CRUD", () => {
  it("追加(期限あり/なし)して、保存される", () => {
    const s = mk();
    const a = s.add({ title: " 京都で紅葉 ", due: "2026-11-30" });
    const b = s.add({ title: "ピアノ", due: "" });
    expect(a).toMatchObject({ title: "京都で紅葉", due: "2026-11-30", note: "", done: false, doneAt: null });
    expect(b.due).toBe("");
    const again = mk();
    let st!: StoreState;
    again.subscribe((x) => { st = x; });
    expect(st.tasks.map((t) => t.title)).toEqual(["京都で紅葉", "ピアノ"]);
    expect(st.ready).toBe(true);
  });
  it("不正な入力は例外", () => {
    const s = mk();
    expect(() => s.add({ title: "  ", due: "" })).toThrow();
    expect(() => s.add({ title: "x", due: "2026-13-01" })).toThrow();
    expect(() => s.add({ title: "x", due: "", note: "y".repeat(2001) })).toThrow();
  });
  it("更新(タイトル・期限・メモ)", () => {
    const s = mk();
    const a = s.add({ title: "A", due: "" });
    s.update(a.id, { title: "B", due: "2026-12-01", note: "メモ\nhttps://example.com" });
    const t = s.snapshot().tasks[0];
    expect(t).toMatchObject({ title: "B", due: "2026-12-01", note: "メモ\nhttps://example.com" });
    expect(t.updatedAt).toBeGreaterThan(t.createdAt);
    expect(() => s.update(a.id, { title: "" })).toThrow();
    expect(() => s.update(a.id, { note: "z".repeat(2001) })).toThrow();
  });
  it("完了/取消でスタンプ累計が増減し、0未満にならない", () => {
    const s = mk();
    const a = s.add({ title: "A", due: "" });
    const b = s.add({ title: "B", due: "" });
    s.setDone(a.id, true);
    s.setDone(b.id, true);
    expect(s.snapshot().stampTotal).toBe(2);
    expect(s.snapshot().tasks[0].doneAt).not.toBeNull();
    s.setDone(a.id, true); // 二重に完了しても増えない
    expect(s.snapshot().stampTotal).toBe(2);
    s.setDone(a.id, false);
    expect(s.snapshot().stampTotal).toBe(1);
    expect(s.snapshot().tasks[0].doneAt).toBeNull();
    // 累計 0 のときに取り消しても 0 のまま
    mem.setItem(TASKS_KEY, JSON.stringify({ tasks: [{ ...s.snapshot().tasks[1] }], stampTotal: 0 }));
    const s2 = mk();
    s2.setDone(b.id, false);
    expect(s2.snapshot().stampTotal).toBe(0);
  });
  it("削除しても累計は減らない、元に戻せる", () => {
    const s = mk();
    const a = s.add({ title: "A", due: "" });
    s.setDone(a.id, true);
    const removed = s.remove(a.id)!;
    expect(s.snapshot().tasks).toHaveLength(0);
    expect(s.snapshot().stampTotal).toBe(1);
    s.restore(removed);
    s.restore(removed); // 二重には戻さない
    expect(s.snapshot().tasks).toEqual([removed]);
  });
  it("購読者に変更が届く", () => {
    const s = mk();
    const seen: number[] = [];
    const un = s.subscribe((x) => seen.push(x.tasks.length));
    s.add({ title: "A", due: "" });
    un();
    s.add({ title: "B", due: "" });
    expect(seen).toEqual([0, 1]);
  });
  it("壊れたデータでも落ちない", () => {
    mem.setItem(TASKS_KEY, "{not json");
    expect(mk().snapshot()).toEqual({ tasks: [], stampTotal: 0 });
    mem.setItem(TASKS_KEY, JSON.stringify({ tasks: [{ id: "x", title: "古い" }, { bad: 1 }], stampTotal: -3 }));
    expect(mk().snapshot()).toEqual({ tasks: [{ id: "x", title: "古い", due: "", note: "", label: "", done: false, doneAt: null, createdAt: 0, updatedAt: 0 }], stampTotal: 0 });
  });
});

describe("設定の保存", () => {
  it("未保存なら null、保存すると読み出せる(不正値は既定値へ)", () => {
    const s = mk();
    let got: unknown = "x";
    s.subscribeSettings((v) => { got = v; })();
    expect(got).toBeNull();
    s.saveSettings({ layout: "c", theme: "wine", wp: "stars", stamp: "good" });
    mk().subscribeSettings((v) => { got = v; })();
    expect(got).toEqual({ layout: "c", theme: "wine", wp: "stars", stamp: "good" });
    mem.setItem(SETTINGS_KEY, JSON.stringify({ layout: "q", theme: "wine" }));
    mk().subscribeSettings((v) => { got = v; })();
    expect(got).toEqual({ layout: "a", theme: "wine", wp: "mesh", stamp: "sumi" });
  });
});
