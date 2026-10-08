import { describe, expect, it } from "vitest";
import { hasLegacyData, planMigration } from "../../src/core/migration";
import type { Task } from "../../src/core/types";

const t = (id: string, p: Partial<Task> = {}): Task => ({ id, title: id, due: "", note: "", done: false, doneAt: null, createdAt: 1, updatedAt: 1, ...p });
const empty = { taskIds: new Set<string>(), stampTotal: 0, hasSettings: false };

describe("旧データの移行計画", () => {
  it("旧データが無ければ移行不要", () => {
    expect(hasLegacyData({ tasks: [], stampTotal: 0, settings: null })).toBe(false);
    expect(hasLegacyData({ tasks: [t("a")], stampTotal: 0, settings: null })).toBe(true);
    expect(hasLegacyData({ tasks: [], stampTotal: 2, settings: null })).toBe(true);
    expect(hasLegacyData({ tasks: [], stampTotal: 0, settings: { layout: "c" } })).toBe(true);
  });
  it("共有側が空なら全部コピー、累計は大きいほう、設定もコピー", () => {
    const p = planMigration({ tasks: [t("a"), t("b")], stampTotal: 5, settings: { layout: "c", theme: "wine", wp: "mesh", stamp: "done" } }, empty);
    expect(p.copy.map((x) => x.id)).toEqual(["a", "b"]);
    expect(p.stampDelta).toBe(5);
    expect(p.settings).toEqual({ layout: "c", theme: "wine", wp: "mesh", stamp: "done" });
  });
  it("共有側にデータがあれば追加で取り込み、重複 ID は上書きしない", () => {
    const p = planMigration({ tasks: [t("a"), t("dup", { title: "旧" })], stampTotal: 3, settings: { layout: "c" } },
      { taskIds: new Set(["dup", "x"]), stampTotal: 7, hasSettings: true });
    expect(p.copy.map((x) => x.id)).toEqual(["a"]);
    expect(p.stampDelta).toBe(0); // 共有側(7)のほうが大きい
    expect(p.settings).toBeNull(); // 共有側に設定がある
  });
  it("累計は差分だけ足して大きいほうに合わせる", () => {
    expect(planMigration({ tasks: [], stampTotal: 10, settings: null }, { ...empty, stampTotal: 4 }).stampDelta).toBe(6);
  });
  it("rules を通らない形のタスクは移さない", () => {
    const p = planMigration({ tasks: [t("ok"), t("x", { title: "" }), t("y", { due: "来週" }), t("z".repeat(65))], stampTotal: 0, settings: null }, empty);
    expect(p.copy.map((x) => x.id)).toEqual(["ok"]);
  });
});
