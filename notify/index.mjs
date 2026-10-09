// いつかやること: 毎朝の通知ウィンドウ
//   node index.mjs                   Firestore から取得して表示
//   node index.mjs --demo            ダミーデータで表示(鍵・Firebase 不要)
//   node index.mjs --quiet-if-empty  未完了が 0 件なら何も出さない
//   node index.mjs --print           ウィンドウを出さず、表示内容(JSON)を標準出力へ
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildView, demoTasks, parseCommand } from "./logic.mjs";
import { fetchPendingTasks, setDone, KeyMissingError, DEFAULT_KEY } from "./fetch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));

function errorView(say, path, detail) {
  return { kind: "error", say, path: path || "", detail: detail || "" };
}

async function makeView() {
  if (args.has("--demo")) return buildView(demoTasks());
  try {
    return buildView(await fetchPendingTasks());
  } catch (e) {
    if (e instanceof KeyMissingError) {
      return errorView("鍵ファイルが見つからないよ。置き場所はここ→", DEFAULT_KEY,
        "key.json という名前で置いてね。別の場所なら、環境変数 SOMEDAY_KEY にパスを入れてね。作り方は notify\\README.md にあるよ。");
    }
    return errorView("読み取りに失敗しちゃった…", "", `${e?.message ?? e}
ネットワークや鍵の権限を確認してね。`);
  }
}

const view = await makeView();
if (args.has("--print")) { console.log(JSON.stringify(view, null, 2)); process.exit(0); }
if (view.kind === "list" && view.total === 0 && args.has("--quiet-if-empty")) process.exit(0);

const dir = mkdtempSync(join(tmpdir(), "someday-notify-"));
const file = join(dir, "view.json");
writeFileSync(file, JSON.stringify(view), "utf8");
const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-WindowStyle", "Hidden",
  "-File", join(here, "show.ps1"), "-Json", file, "-Icon", join(here, "assets", "icon.png")];
if (process.env.SOMEDAY_SHOT) psArgs.push("-Shot", process.env.SOMEDAY_SHOT);
if (process.env.SOMEDAY_AUTOSEQ) psArgs.push("-AutoSeq", process.env.SOMEDAY_AUTOSEQ); // 確認用: 行のチェックを自動で押す
// show.ps1 は、チェックを押すと標準出力に「DONE <id>」/「UNDONE <id>」を1行で書く。
// ここで Firestore に書き込み、結果を標準入力へ「OK <id>」/「ERR <id>」で返す(--demo は書き込まずに OK)。
const demo = args.has("--demo");
const ps = spawn("powershell.exe", psArgs, { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
const reply = (s) => { try { ps.stdin.write(s + "\n"); } catch { /* ウィンドウが閉じた後 */ } };
ps.stdin.on("error", () => {});
let queue = Promise.resolve();
createInterface({ input: ps.stdout }).on("line", (line) => {
  const cmd = parseCommand(line);
  if (!cmd) return;
  queue = queue.then(async () => {
    try {
      if (!demo) await setDone(cmd.id, cmd.done);
      reply(`OK ${cmd.id}`);
    } catch (e) {
      console.error(`保存に失敗: ${cmd.id} ${e?.message ?? e}`);
      reply(`ERR ${cmd.id}`);
    }
  });
});
const code = await new Promise((res) => ps.on("close", (c) => res(c ?? 0)));
await queue;
rmSync(dir, { recursive: true, force: true });
process.exit(code);
