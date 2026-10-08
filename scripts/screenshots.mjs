// スクリーンショット撮影: node scripts/screenshots.mjs [URL]
// サンプルデータを localStorage に入れて、スマホ幅・PC幅・ダークテーマを撮る(ローカルモード)
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const url = process.argv[2] || "http://localhost:5178/";
const out = new URL("../screenshots/", import.meta.url);
mkdirSync(out, { recursive: true });
const ymd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const now = Date.now();
const t = (i, title, due, done = false, note = "") => ({ id: "s" + i, title, due, note, done, doneAt: done ? now - i * 864e5 : null, createdAt: now - (20 - i) * 1000, updatedAt: now });
const data = { stampTotal: 13, tasks: [
  t(1, "京都で紅葉を見る", ymd(52), false, "宿の候補: https://example.com/kyoto\n嵐山は朝早めに"),
  t(2, "ピアノをもう一度はじめる", ""),
  t(3, "写真をアルバムにまとめる", ymd(83)),
  t(4, "パスポートを更新する", ymd(11)),
  t(5, "英語の映画を字幕なしで観る", ""),
  t(6, "部屋の模様替え", ""),
  t(7, "駅前の新しいパン屋に行く", "", true),
  t(8, "本棚を片付ける", ymd(-4), true),
] };
const shots = [
  { name: "phone-penguin", w: 390, h: 844, s: { layout: "a", theme: "penguin", wp: "mesh", stamp: "sumi" } },
  { name: "phone-penguin-tile", w: 390, h: 844, s: { layout: "c", theme: "penguin", wp: "none", stamp: "kanryo" } },
  { name: "pc-penguin-cards", w: 1280, h: 900, s: { layout: "a", theme: "penguin", wp: "mesh", stamp: "sumi" } },
  { name: "pc-penguin-tiles", w: 1280, h: 900, s: { layout: "c", theme: "penguin", wp: "dots", stamp: "good" } },
  { name: "pc-midnight-dark", w: 1280, h: 900, s: { layout: "c", theme: "midnight", wp: "aurora", stamp: "done" } },
  { name: "phone-midnight-dark", w: 390, h: 844, s: { layout: "a", theme: "midnight", wp: "stars", stamp: "sumi" } },
];
const browser = await chromium.launch();
for (const sh of shots) {
  const ctx = await browser.newContext({ viewport: { width: sh.w, height: sh.h }, deviceScaleFactor: 2, serviceWorkers: "block", locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  await ctx.addInitScript(([d, s]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("someday-tasks-v1", d); localStorage.setItem("someday-settings-v1", s); sessionStorage.setItem("seeded", "1");
    }
  }, [JSON.stringify(data), JSON.stringify(sh.s)]);
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForSelector(".list .item");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: new URL(`${sh.name}.png`, out).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
  if (sh.name === "phone-penguin") {
    await page.click('[data-act="settings"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: new URL("phone-settings.png", out).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
    await page.keyboard.press("Escape");
    await page.click('[data-edit="s1"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: new URL("phone-edit-note.png", out).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
  }
  await ctx.close();
}
await browser.close();
console.log("saved to", out.pathname);
