import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLine, encodeB64Json, decodeB64Json, newTaskData, choosePosition, placeReply } from "../proto.mjs";
import { makeHandler } from "../handler.mjs";
import { loadPos, savePos } from "../winstate.mjs";
import { buildView, demoTasks, dueChips, sortKey, sortPending } from "../logic.mjs";
// アプリ本体の実装と突き合わせる
import { buildTask } from "../../src/store/local.ts";
import { validateTitle as appTitle } from "../../src/core/logic.ts";

const NOW = new Date("2026-10-09T01:00:00Z"); // 10/9(金) 10:00 JST

describe("1行プロトコル", () => {
  it("ADD: base64 の JSON なら改行・空白・日本語を含むタイトルも壊れない", () => {
    const input = { title: "牛乳 と\nパン\t買う 🍞", due: "2026-10-10", label: "private" };
    const r = parseLine(`ADD a1 ${encodeB64Json(input)}`);
    expect(r).toEqual({ type: "add", req: "a1", input });
  });
  it("ADD: 壊れた base64 / 余分な項目は null", () => {
    expect(parseLine("ADD a1 !!!")).toBeNull();
    expect(parseLine("ADD a1")).toBeNull();
    expect(parseLine(`ADD a/1 ${encodeB64Json({})}`)).toBeNull();
    expect(parseLine(`ADD a1 ${encodeB64Json({})} x`)).toBeNull();
  });
  it("DONE / UNDONE / PLACE / STATE", () => {
    expect(parseLine("DONE abc")).toEqual({ type: "done", done: true, id: "abc" });
    expect(parseLine("UNDONE abc")).toEqual({ type: "done", done: false, id: "abc" });
    expect(parseLine(`PLACE ${encodeB64Json({ sig: "s" })}`)).toEqual({ type: "place", env: { sig: "s" } });
    expect(parseLine(`STATE ${encodeB64Json({ x: 10.4, y: 20, sig: "s", w: 600, h: null, expanded: true })}`))
      .toEqual({ type: "state", state: { x: 10, y: 20, sig: "s", w: 600, h: null, expanded: true } });
    // x だけ・y だけは「中央」(null)扱い
    expect(parseLine(`STATE ${encodeB64Json({ x: 10, sig: "s" })}`).state).toMatchObject({ x: null, y: null, expanded: false });
    expect(parseLine("HELLO")).toBeNull();
  });
  it("base64 の往復", () => expect(decodeB64Json(encodeB64Json({ a: "あ" }))).toEqual({ a: "あ" }));
});

describe("追加データの形(アプリ本体 buildTask と一致)", () => {
  const cases = [
    { title: "  牛乳を   買う  ", due: "", label: "" },
    { title: "請求書", due: "2026-10-31", label: "work" },
    { title: "あ".repeat(100), due: "2027-02-28", label: "private" },
  ];
  for (const c of cases) {
    it(`同じ値になる: ${c.title.slice(0, 8)}…`, () => {
      const r = newTaskData(c, 1760000000000);
      expect(r.ok).toBe(true);
      const app = buildTask({ ...c, note: "" }, "ID", 1760000000000);
      const { id, ...appData } = app;
      expect(r.value).toEqual(appData);
      expect(Object.keys(r.value).sort()).toEqual(["createdAt", "done", "doneAt", "due", "label", "note", "title", "updatedAt"]);
    });
  }
  it("アプリと同じく弾く: 空・101文字・存在しない日付・不正ラベル", () => {
    for (const bad of [{ title: "   " }, { title: "あ".repeat(101) }, { title: "x", due: "2026-02-30" }, { title: "x", due: "2026/10/01" }, { title: "x", label: "home" }]) {
      expect(newTaskData(bad, 1).ok).toBe(false);
      expect(() => buildTask({ title: bad.title, due: bad.due ?? "", note: "", label: bad.label ?? "" }, "ID", 1)).toThrow();
    }
  });
  it("タイトルの整え方がアプリの validateTitle と同じ", () => {
    for (const t of ["  a  b ", "改行\nあり", "タブ\tあり", "😀".repeat(100)]) {
      const r = newTaskData({ title: t }, 1);
      expect(r.ok ? r.value.title : null).toBe(appTitle(t).ok ? appTitle(t).value : null);
    }
  });
  it("createdAt/updatedAt は整数、done=false、doneAt=null、note=''", () => {
    expect(newTaskData({ title: "x" }, 12.9).value).toMatchObject({ createdAt: 12, updatedAt: 12, done: false, doneAt: null, note: "" });
  });
});

describe("期限チップ(JST)", () => {
  it("金曜 10/9: 今日・明日・今週末(土)・来週", () => {
    expect(dueChips(NOW).map((c) => c.ymd)).toEqual(["", "2026-10-09", "2026-10-10", "2026-10-10", "2026-10-16"]);
  });
  it("日曜は今週末=今日", () => {
    expect(dueChips(new Date("2026-10-11T01:00:00Z"))[3].ymd).toBe("2026-10-11");
  });
});

describe("並び順のキー", () => {
  it("キーの文字列順が sortPending と同じ", () => {
    const ts = demoTasks(NOW);
    const byKey = [...ts].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1)).map((t) => t.id);
    expect(byKey).toEqual(sortPending(ts).map((t) => t.id));
  });
});

describe("buildView の展開", () => {
  it("既定は5件+残り(rest)、--all は最初から展開", () => {
    const v = buildView(demoTasks(NOW), NOW);
    expect(v).toMatchObject({ limit: 5, expanded: false });
    expect(v.items.length + v.rest.length).toBe(12);
    const all = buildView(demoTasks(NOW), NOW, Infinity);
    expect(all).toMatchObject({ limit: 5, expanded: true, more: 0 });
    expect(all.items).toHaveLength(12);
  });
});

describe("ウィンドウ位置", () => {
  const env = {
    sig: "A", win: { w: 478, h: 700 }, center: { x: 721, y: 170 },
    screens: [{ x: 0, y: 0, w: 1920, h: 1040 }, { x: -1920, y: 0, w: 1920, h: 1040 }],
  };
  it("保存なし → 中央", () => expect(choosePosition(null, env)).toEqual({ x: 721, y: 170, centered: true }));
  it("モニター構成が変わった → 中央", () => expect(choosePosition({ x: 10, y: 10, sig: "B" }, env).centered).toBe(true));
  it("画面外 → 中央", () => {
    expect(choosePosition({ x: 5000, y: 10, sig: "A" }, env).centered).toBe(true);
    expect(choosePosition({ x: 10, y: -900, sig: "A" }, env).centered).toBe(true);
  });
  it("2枚目の画面にあればそこ", () => expect(choosePosition({ x: -1700, y: 120, sig: "A" }, env)).toEqual({ x: -1700, y: 120, centered: false }));
  it("一部はみ出しは画面内に寄せる", () => {
    expect(choosePosition({ x: 1600, y: 600, sig: "A" }, env)).toEqual({ x: 1920 - 478, y: 1040 - 700, centered: false });
  });
  it("PLACE の返事に前回の大きさ・展開状態が入る", () => {
    expect(placeReply(null, env)).toBe("PLACE 721 170 - - 0 c");
    expect(placeReply({ x: 100, y: 50, sig: "A", w: 600, h: 320, expanded: true }, env)).toBe("PLACE 100 50 600 320 1 p");
    // 位置は中央に戻っても、大きさは引き継ぐ
    expect(placeReply({ x: null, y: null, sig: "B", w: 600, h: null, expanded: false }, env)).toBe("PLACE 721 170 600 - 0 c");
  });
});

describe("位置・大きさの保存(window.json)", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "notify-state-")); process.env.SOMEDAY_STATE_DIR = dir; });
  afterEach(() => { delete process.env.SOMEDAY_STATE_DIR; rmSync(dir, { recursive: true, force: true }); });
  it("保存して読み戻せる / 無ければ null / 壊れていれば null", () => {
    expect(loadPos()).toBeNull();
    savePos({ x: 1, y: 2, sig: "A", w: 600, h: null, expanded: true });
    expect(loadPos()).toEqual({ x: 1, y: 2, sig: "A", w: 600, h: null, expanded: true });
    expect(JSON.parse(readFileSync(join(dir, "window.json"), "utf8")).w).toBe(600);
  });
  it("handler: STATE を保存し、PLACE で使う", async () => {
    const h = makeHandler({ demo: true, loadPos, savePos, now: () => 0 });
    expect(await h(`STATE ${encodeB64Json({ x: 100, y: 50, sig: "A", w: 600, h: 300, expanded: true })}`)).toBeNull();
    const env = { sig: "A", win: { w: 478, h: 700 }, center: { x: 721, y: 170 }, screens: [{ x: 0, y: 0, w: 1920, h: 1040 }] };
    expect(await h(`PLACE ${encodeB64Json(env)}`)).toBe("PLACE 100 50 600 300 1 p");
  });
});

describe("handler: 追加と完了", () => {
  it("ADD: 書き込んで、一覧の1行を返す", async () => {
    const written = [];
    const h = makeHandler({ demo: false, addTask: async (d) => { written.push(d); return "NEWID"; }, now: () => NOW.getTime() });
    const r = await h(`ADD a7 ${encodeB64Json({ title: " 牛乳 ", due: "2026-10-10", label: "work" })}`);
    expect(written).toEqual([{ title: "牛乳", due: "2026-10-10", note: "", label: "work", done: false, doneAt: null, createdAt: NOW.getTime(), updatedAt: NOW.getTime() }]);
    const [cmd, req, b64] = r.split(" ");
    expect([cmd, req]).toEqual(["ADDED", "a7"]);
    expect(decodeB64Json(b64)).toMatchObject({ id: "NEWID", title: "牛乳", due: "10/10(土)まで・あと1日", dueCls: "soon", label: "仕事" });
  });
  it("ADD: 検証エラー・保存エラー", async () => {
    const h = makeHandler({ demo: false, addTask: async () => { throw new Error("x"); }, now: () => 0 });
    expect(await h(`ADD a1 ${encodeB64Json({ title: "" })}`)).toBe("ADDERR a1 empty");
    expect(await h(`ADD a2 ${encodeB64Json({ title: "x" })}`)).toBe("ADDERR a2 save");
  });
  it("--demo は書き込まない", async () => {
    let called = 0;
    const h = makeHandler({ demo: true, addTask: async () => { called++; return "x"; }, setDone: async () => { called++; }, now: () => 0 });
    expect(await h(`ADD a1 ${encodeB64Json({ title: "x" })}`)).toMatch(/^ADDED a1 /);
    expect(await h("DONE abc")).toBe("OK abc");
    expect(called).toBe(0);
  });
  it("DONE の失敗は ERR", async () => {
    const h = makeHandler({ demo: false, setDone: async () => { throw new Error("no"); }, now: () => 0 });
    expect(await h("DONE abc")).toBe("ERR abc");
  });
});
