// いつかやること: 毎朝の通知ウィンドウ
//   node index.mjs                   Firestore から取得して表示
//   node index.mjs --demo            ダミーデータで表示(鍵・Firebase 不要)
//   node index.mjs --quiet-if-empty  未完了が 0 件なら何も出さない
//   node index.mjs --all             最初から全件を展開して表示
//   node index.mjs --manual          手動(タスクバー/ショートカット)で開いた。前回のミニ表示を引き継ぐ
//   node index.mjs --print           ウィンドウを出さず、表示内容(JSON)を標準出力へ
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildView, demoTasks, MAX_ITEMS } from "./logic.mjs";
import { fetchPendingTasks, setDone, addTask, KeyMissingError, DEFAULT_KEY } from "./fetch.mjs";
import { makeHandler } from "./handler.mjs";
import { acquireInstance, sendToPrimary, defaultPipeName } from "./instance.mjs";
import { encodeB64Json } from "./proto.mjs";
import { loadPos, savePos } from "./winstate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const max = args.has("--all") ? Infinity : MAX_ITEMS;

function errorView(say, path, detail) {
  return { kind: "error", say, path: path || "", detail: detail || "" };
}

async function makeView() {
  if (args.has("--demo")) return buildView(demoTasks(), new Date(), max);
  try {
    return buildView(await fetchPendingTasks(), new Date(), max);
  } catch (e) {
    if (e instanceof KeyMissingError) {
      return errorView("鍵ファイルが見つからないよ。置き場所はここ→", DEFAULT_KEY,
        "key.json という名前で置いてね。別の場所なら、環境変数 SOMEDAY_KEY にパスを入れてね。作り方は notify\\README.md にあるよ。");
    }
    return errorView("読み取りに失敗しちゃった…", "", `${e?.message ?? e}
ネットワークや鍵の権限を確認してね。`);
  }
}

if (args.has("--print")) { console.log(JSON.stringify(await makeView(), null, 2)); process.exit(0); }

// 多重起動しない: すでにダイアログが開いていれば、そちらに「開いて」と伝えて終わる
const manual = args.has("--manual");
const pipeName = defaultPipeName();
let onOpen = () => {};
const inst = await acquireInstance(pipeName, (line) => onOpen(line));
if (!inst.primary) {
  const ok = await sendToPrimary(pipeName, `OPEN ${manual ? "manual" : "scheduled"}`);
  console.error(ok ? "すでに開いているダイアログに知らせました" : "既存のダイアログに知らせられませんでした");
  process.exit(0);
}

const view = await makeView();
if (view.kind === "list" && view.total === 0 && args.has("--quiet-if-empty")) process.exit(0);

const dir = mkdtempSync(join(tmpdir(), "someday-notify-"));
const file = join(dir, "view.json");
writeFileSync(file, JSON.stringify(view), "utf8");
const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-WindowStyle", "Hidden",
  "-File", join(here, "show.ps1"), "-Json", file, "-Icon", join(here, "assets", "icon.png")];
if (process.env.SOMEDAY_SHOT) psArgs.push("-Shot", process.env.SOMEDAY_SHOT);
// 確認用(マウスを動かさずに操作): 行のチェック / 追加 / 「ほか N件」を開く
if (process.env.SOMEDAY_AUTOSEQ) psArgs.push("-AutoSeq", process.env.SOMEDAY_AUTOSEQ);
if (process.env.SOMEDAY_AUTOADD) psArgs.push("-AutoAdd", process.env.SOMEDAY_AUTOADD);
if (process.env.SOMEDAY_AUTOEXPAND) psArgs.push("-AutoExpand");
if (process.env.SOMEDAY_AUTOMINI) psArgs.push("-AutoMini");
// show.ps1 とは1行プロトコルでやりとりする(proto.mjs)。--demo は Firestore に書き込まない
const handle = makeHandler({
  demo: args.has("--demo"), manual, setDone, addTask, loadPos, savePos,
  now: () => Date.now(), log: (s) => console.error(s),
});
const ps = spawn("powershell.exe", psArgs, { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
const reply = (s) => { try { ps.stdin.write(s + "\n"); } catch { /* ウィンドウが閉じた後 */ } };
ps.stdin.on("error", () => {});
let queue = Promise.resolve();
createInterface({ input: ps.stdout }).on("line", (line) => {
  // 位置の問い合わせは表示を待たせないよう、書き込みの順番待ちとは別にすぐ返す
  if (line.startsWith("PLACE ")) { handle(line).then((r) => r && reply(r)); return; }
  queue = queue.then(async () => { const r = await handle(line); if (r) reply(r); });
});
// 2つ目の起動から「開いて」が来たら: 定時は最新の一覧に入れ替えて通常表示で知らせる / 手動は前に出すだけ
onOpen = (line) => {
  const kind = line === "OPEN scheduled" ? "scheduled" : line === "OPEN manual" ? "manual" : null;
  if (!kind) return;
  queue = queue.then(async () => {
    if (kind === "scheduled") {
      const v = await makeView();
      if (v.kind === "list") reply(`RELOAD ${encodeB64Json(v)}`);
      reply("OPEN normal");
    } else reply("OPEN keep");
  });
};
const code = await new Promise((res) => ps.on("close", (c) => res(c ?? 0)));
await queue;
rmSync(dir, { recursive: true, force: true });
await inst.close();
process.exit(code);
