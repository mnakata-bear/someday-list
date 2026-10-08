// いつかやること: 毎朝の通知ウィンドウ
//   node index.mjs                   Firestore から取得して表示
//   node index.mjs --demo            ダミーデータで表示(鍵・Firebase 不要)
//   node index.mjs --quiet-if-empty  未完了が 0 件なら何も出さない
//   node index.mjs --print           ウィンドウを出さず、表示内容(JSON)を標準出力へ
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildView, demoTasks } from "./logic.mjs";
import { fetchPendingTasks, KeyMissingError, DEFAULT_KEY } from "./fetch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));

function errorView(title, message) {
  return { kind: "error", heading: title, message };
}

async function makeView() {
  if (args.has("--demo")) return buildView(demoTasks());
  try {
    return buildView(await fetchPendingTasks());
  } catch (e) {
    if (e instanceof KeyMissingError) {
      return errorView("鍵ファイルが見つかりません",
        "Firebase のサービスアカウント鍵(JSON)がまだ置かれていません。\n\n" +
        `次の場所に key.json という名前で置いてください:\n${DEFAULT_KEY}\n\n` +
        "別の場所に置く場合は、環境変数 SOMEDAY_KEY にそのパスを入れてください。\n" +
        "鍵の作り方は notify\\README.md を見てください。");
    }
    return errorView("読み取りに失敗しました", `未完了のタスクを取得できませんでした。\n\n${e?.message ?? e}\n\nネットワークや鍵の権限を確認してください。`);
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
const r = spawnSync("powershell.exe", psArgs, { stdio: "inherit", windowsHide: true });
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 0);
