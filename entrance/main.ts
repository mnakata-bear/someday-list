import "./style.css";
import { forgetSlug, loadSavedSlug, saveSlug, slugFor } from "../src/core/gate-slug";

/*
 * 入口ページ(表紙+合言葉)。
 * 合言葉から slug を計算し、app-<slug>/ が存在すれば(HEAD が 200)アプリへ移動する。
 * 一度通った端末は slug を覚えておき、次からは自動で移動する。
 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cover = $("cover");
const startBtn = $<HTMLButtonElement>("start");
const opening = $("opening");
const form = $<HTMLFormElement>("pass");
const field = $("field");
const pw = $<HTMLInputElement>("pw");
const eye = $<HTMLButtonElement>("eye");
const go = $<HTMLButtonElement>("go");
const msg = $("pw-msg");

type State = "intro" | "checking" | "pass" | "busy";
function setState(s: State) {
  cover.dataset.state = s;
  startBtn.hidden = s !== "intro";
  opening.hidden = s !== "checking";
  form.hidden = s !== "pass" && s !== "busy";
  go.disabled = s === "busy";
  pw.readOnly = s === "busy";
}

const appURL = (slug: string) => new URL(`app-${slug}/`, location.href).href;

/** app-<slug>/ があるか。true=ある / false=ない(404 など) / null=通信できない */
async function exists(slug: string): Promise<boolean | null> {
  try {
    const r = await fetch(appURL(slug), { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch {
    return null;
  }
}

function showMsg(text: string) {
  msg.textContent = text;
  msg.hidden = !text;
  field.classList.toggle("bad", !!text);
}
function shake() {
  field.classList.remove("shake");
  void field.offsetWidth; // アニメーションをやり直す
  field.classList.add("shake");
}

/* ---- 旧 Service Worker(ルートのスコープ)の解除 ---- */
async function cleanupOldServiceWorker() {
  const root = new URL(import.meta.env.BASE_URL, location.href).href;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.filter((r) => r.scope === root).map((r) => r.unregister()));
    }
  } catch { /* noop */ }
  try {
    if ("caches" in self) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.endsWith(root)).map((k) => caches.delete(k)));
    }
  } catch { /* noop */ }
}

const cleanupDone = cleanupOldServiceWorker();

/* ---- 操作 ---- */
startBtn.addEventListener("click", () => {
  setState("pass");
  pw.focus();
});

eye.addEventListener("click", () => {
  const show = pw.type === "password";
  pw.type = show ? "text" : "password";
  eye.setAttribute("aria-pressed", String(show));
  eye.setAttribute("aria-label", show ? "合言葉を隠す" : "合言葉を表示する");
  pw.focus();
});

pw.addEventListener("input", () => { if (!msg.hidden) showMsg(""); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (cover.dataset.state === "busy") return;
  const value = pw.value;
  if (!value.trim()) { showMsg("合言葉を入力してください"); shake(); pw.focus(); return; }
  setState("busy");
  showMsg("");
  let slug = "";
  try {
    slug = await slugFor(value);
  } catch {
    setState("pass");
    showMsg("このブラウザでは確認できませんでした(https で開いてください)");
    return;
  }
  const ok = await exists(slug);
  if (ok) {
    saveSlug(slug);
    cover.dataset.state = "leaving";
    await cleanupDone; // 旧 SW が app-<slug>/ への移動を横取りしないように、解除を済ませてから
    location.assign(appURL(slug));
    return;
  }
  setState("pass");
  showMsg(ok === false ? "合言葉が違います" : "接続できませんでした。通信を確認して、もう一度お試しください");
  shake();
  pw.select();
});

/* ---- 起動 ---- */
async function boot() {
  const saved = loadSavedSlug();
  if (!saved) { setState("intro"); return; }
  setState("checking");
  const ok = await exists(saved);
  if (ok === false) { // 合言葉が変わったなど
    forgetSlug();
    setState("intro");
    return;
  }
  await cleanupDone; // 旧 SW の解除を済ませてから移動する
  cover.dataset.state = "leaving";
  location.replace(appURL(saved)); // 通信できないとき(null)も、アプリ側のオフライン表示に任せて移動する
}
void boot();

// 「戻る」でキャッシュから復元されたときは、入力できる状態に戻す
addEventListener("pageshow", (e) => {
  if (e.persisted && cover.dataset.state === "leaving") setState(loadSavedSlug() ? "pass" : "intro");
});
