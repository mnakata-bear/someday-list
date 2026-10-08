// アイコン生成: scripts/icon-source.webp(ペンギン) から PWA 用の PNG を作る
//   npm run icons
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const src = fileURLToPath(new URL("./icon-source.webp", import.meta.url));
const out = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(out, { recursive: true });
const BG = "#8bd0fb"; // アイコンの空色と同じ色

// 元画像の白い四隅を取り除き、角丸の部分だけにする
const CROP = { left: 56, top: 56, width: 1144, height: 1144 };
const mask = Buffer.from(`<svg width="1144" height="1144"><rect width="1144" height="1144" rx="240" fill="#fff"/></svg>`);
const base = await sharp(src).extract(CROP).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

const plain = (s) => sharp(base).resize(s, s).png();
const onBg = async (s, ratio) => {
  const inner = Math.round(s * ratio);
  const fg = await sharp(base).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: s, height: s, channels: 4, background: BG } })
    .composite([{ input: fg, gravity: "center" }]).png();
};

for (const s of [192, 512]) await plain(s).toFile(out + `icon-${s}.png`);
// maskable: 安全領域(中央80%)に収まるよう縮小し、空色の正方形に配置
for (const s of [192, 512]) await (await onBg(s, 0.84)).toFile(out + `maskable-${s}.png`);
// apple-touch-icon: iOS が角丸を付けるので、空色背景にほぼ全面で配置
await (await onBg(180, 1.0)).toFile(out + "apple-touch-icon.png");
await plain(32).toFile(out + "favicon-32.png");
await sharp(base).resize(128, 128).webp({ quality: 90 }).toFile(out + "app-icon.webp");
console.log("icons generated in", out);
