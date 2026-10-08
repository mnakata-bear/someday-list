// 合言葉から slug を計算する(Node 版。src/core/gate-slug.ts と同じ計算)。
// 使い方: APP_PASSPHRASE を環境変数で渡すと、slug を 1 行だけ標準出力に出す(CI ではすぐ ::add-mask:: すること)。
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export function slugFor(passphrase) {
  const norm = String(passphrase).normalize("NFC").trim();
  return createHash("sha256").update("someday-list:" + norm, "utf8").digest("hex").slice(0, 24);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pass = process.env.APP_PASSPHRASE ?? "";
  if (!pass.trim()) {
    console.error("APP_PASSPHRASE が空です");
    process.exit(1);
  }
  process.stdout.write(slugFor(pass) + "\n");
}
