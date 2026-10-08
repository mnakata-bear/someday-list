import "./styles.css";
import type { Label, Settings, Task } from "./core/types";
import { LABELS } from "./core/types";
import { LAYOUTS, STAMPS, THEMES, WPS, stampMark } from "./core/themes";
import {
  NOTE_MAX, dueInfo, esc, filterTasks, firstLine, labelCounts, linkify, md, normalizeFilter, normalizeSettings, sortTasks, stampCardState, taskStats, upcoming,
  validateDue, validateLabel, validateNote, validateTitle, type LabelFilter,
} from "./core/logic";
import { parseSpoken } from "./core/spoken";
import { LocalStore } from "./store/local";
import type { Store, StoreState } from "./store/types";
import type { Cloud, CloudUser } from "./store/cloud";
import { isAllowedAccount } from "./core/access";
import type { FirestoreStore } from "./store/firestore";
import { firebaseConfig, useEmulator } from "./firebase-config";
import { clearPhoto, loadPhoto, savePhoto } from "./ui/photo";
import { Voice, speechSupported } from "./ui/voice";
import * as I from "./ui/icons";
import { forgetSlug, loadSavedSlug } from "./core/gate-slug";

/* ================= 状態 ================= */
const app = document.getElementById("app") as HTMLElement;
const shell = document.getElementById("shell") as HTMLElement;
const bgwall = app.querySelector(".bgwall") as HTMLElement;
const toastEl = document.getElementById("toast") as HTMLElement;
const settingsDlg = document.getElementById("settings") as HTMLDialogElement;
const editorDlg = document.getElementById("editor") as HTMLDialogElement;
const askDlg = document.getElementById("ask") as HTMLDialogElement;
const photoInput = document.getElementById("photo") as HTMLInputElement;
const ICON = `${import.meta.env.BASE_URL}icons/app-icon.webp`;
const mq = matchMedia("(min-width: 900px)");

const localStore = new LocalStore();
let store: Store = localStore;
let unsubStore: (() => void) | null = null;
let unsubSettings: (() => void) | null = null;
let state: StoreState = { tasks: [], stampTotal: 0, ready: false, pending: false, remote: null };
let settings: Settings = normalizeSettings(null);
{
  let first: Settings | null = null;
  localStore.subscribeSettings((s) => { first = s; })();
  if (first) settings = first;
}
let cloud: Cloud | null = null;
/** 旧データの移行中か(移行中はクラウドに設定が無くても今の設定をのせない。旧の設定を移すため) */
let migrating = false;
/** 移行中に「クラウドに設定が無い」と分かったか(移行後にのせる) */
let settingsMissing = false;
let user: CloudUser | null = null;
let authResolved = !firebaseConfig;
let photoURL = "";
let online = navigator.onLine;
let remoteBusyUntil = 0;
let editingId: string | null = null;

/* ラベル: 絞り込みは端末ごとに localStorage、追加フォームで選んだラベルはメモリ内(次の追加でも維持) */
const FILTER_KEY = "someday-filter-v1";
let filter: LabelFilter = (() => { try { return normalizeFilter(localStorage.getItem(FILTER_KEY)); } catch { return "all" as LabelFilter; } })();
let addLabel: Label = "";
/** 追加するときに付けるラベル(絞り込み中はそのラベルに固定) */
const effectiveAddLabel = (): Label => (filter === "all" ? addLabel : filter);
function setFilter(f: LabelFilter) {
  filter = f;
  try { localStorage.setItem(FILTER_KEY, f); } catch { /* 保存できなくても動く */ }
  fill();
}

/**
 * ログインの壁(Firebase 設定ありのビルドだけ)。null のときだけアプリ画面を描画する。
 *   checking: ログイン状態の確認中 / login: 未ログイン / error: クラウドに接続できない
 */
type Gate = "checking" | "login" | "error" | null;
let gate: Gate = firebaseConfig ? "checking" : null;
let gateMsg = "";
let gateBusy = false;
const EMPTY_STATE: StoreState = { tasks: [], stampTotal: 0, ready: false, pending: false, remote: null };

/** チェック時のスタンプ押下・他端末からの変更のハイライト(期限つき) */
const fx = new Map<string, { kind: "pop" | "flash" | "lbl"; until: number }>();
let cardPop: { from: number; until: number } | null = null;

/* ================= テーマ ================= */
function applyTheme() {
  const th = gate ? THEMES.penguin : (THEMES[settings.theme] ?? THEMES.penguin); // ログイン画面はペンギンの色で固定
  const st = app.style;
  const set = (k: string, v: string) => st.setProperty(k, v);
  set("--bg", th.bg); set("--surface", th.s); set("--surface2", th.s2); set("--border", th.b);
  set("--text", th.t); set("--muted", th.m); set("--a1", th.a1); set("--a2", th.a2);
  set("--stamp", th.st); set("--danger", th.dk ? "#ff7a8a" : "#d43d55"); set("--on", th.on || "#ffffff");
  set("--warn", th.dk ? "#f5b041" : "#c26a12");
  set("--ckr", settings.layout === "c" ? "50%" : "9px"); set("--blend", th.dk ? "normal" : "multiply"); set("--scheme", th.dk ? "dark" : "light");
  if (photoURL) set("--photo", `url("${photoURL}")`);
  const wp = gate ? "none" : settings.wp === "photo" && !photoURL ? "mesh" : settings.wp;
  app.className = gate ? "t la gated" : `t l${settings.layout} st-${settings.stamp}${th.dk ? " dk" : ""}${wp !== "none" ? " wpon" : ""}`;
  bgwall.className = `bgwall wp-${wp}`;
  document.documentElement.style.setProperty("--page-bg", th.bg);
  document.documentElement.style.colorScheme = th.dk ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", th.bg);
}

/* ================= テンプレート ================= */
const gearBtn = `<button type="button" class="iconbtn" data-act="settings" aria-label="設定(テーマ・壁紙・スタンプ・レイアウト)">${I.gear}</button>`;
const micBtn = (k: string) => speechSupported()
  ? `<button type="button" class="mic" data-mic="${k}" aria-label="音声で入力" aria-pressed="false">${I.mic}</button>` : "";

const formHTML = () => `<form class="add" data-form="add" novalidate autocomplete="off">
  <span class="vstat" data-vstat="add" hidden>聞いています…</span>
  <div class="tin"><input type="text" name="t" placeholder="いつかやりたいことを追加…" aria-label="やること" maxlength="100" enterkeyhint="done">${micBtn("add")}</div>
  <label class="dwrap">期限<small>(任意)</small><input type="date" name="d" aria-label="期限（任意）"></label>
  <div class="lblpick" role="group" aria-label="ラベル(任意)">${(["work", "private"] as const).map((k) => `<button type="button" class="lpill ${k}" data-lbl="${k}" aria-pressed="false">${LABELS[k]}</button>`).join("")}</div><button class="btn" type="submit">追加</button>
  <p class="ferr" role="alert" hidden></p></form>`;

function pcA() {
  return `<main class="pc-in">
    <header class="hello gl"><div class="brandrow"><img class="appicon" src="${ICON}" alt="" width="44" height="44"><div><small>Someday List</small><h1>いつかやること</h1></div></div><div class="hacts"><span data-r="sync"></span>${gearBtn}</div></header>
    <div class="row2">
      <section class="card gl" data-r="statsA" aria-label="達成状況"></section>
      <section class="card gl" aria-label="スタンプカード"><div class="lab">Stamp Card<span data-r="cardInfo"></span></div><div data-r="stamp"></div></section>
    </div>
    <div class="addbox gl">${formHTML()}</div>
    <section data-r="list" aria-label="やることの一覧"></section></main>`;
}
function pcC() {
  return `<main class="pc-in">
    <section class="card hero gl"><div class="lab"><span class="brandrow" style="gap:10px"><img class="appicon" style="width:32px;height:32px;border-radius:9px" src="${ICON}" alt="" width="32" height="32"><small>Someday List</small></span><span class="hacts"><span data-r="sync"></span>${gearBtn}</span></div><h1>いつか、ちゃんとやる。</h1><div data-r="statsC"></div></section>
    <section class="card t-stamp gl" aria-label="スタンプカード"><div class="lab">Stamp Card<span data-r="cardInfoC"></span></div><div data-r="stamp"></div></section>
    <section class="card t-list gl"><div class="lab">いつかやること</div>${formHTML()}<div style="height:10px"></div><div data-r="list"></div></section>
    <section class="card t-next gl"><div class="lab">期限つき</div><div data-r="next"></div></section></main>`;
}
function phone() {
  return `<div class="ph"><div class="ph-body">
    <header class="ph-head gl"><div class="brandrow"><img class="appicon" src="${ICON}" alt="" width="36" height="36"><div><small>Someday</small><h1>いつかやること</h1></div></div>${gearBtn}<span data-r="sync"></span></header>
    <section class="card ph-card gl" aria-label="達成状況"><div data-r="statsPh"></div><div class="lab">Stamp Card<span data-r="cardInfo"></span></div><div data-r="stamp"></div></section>
    <section data-r="list" aria-label="やることの一覧"></section>
  </div><footer class="ph-foot gl">${formHTML()}</footer></div>`;
}

const googleG = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/** ログイン画面(確認中も同じ見た目)。アプリの中身は一切含めない */
function gateHTML() {
  const action = gate === "checking"
    ? `<div class="gate-wait" role="status" data-testid="gate-checking"><span class="spin"></span>確認しています…</div>`
    : gate === "error"
      ? `<button type="button" class="gate-btn" data-act="reload">再読み込み</button>`
      : `<button type="button" class="gate-btn" data-act="login"${gateBusy ? " disabled" : ""}><span class="gchip">${googleG}</span><span>Googleでログイン</span></button>`;
  return `<main class="gate" data-testid="gate" data-gate="${gate}">
    <div class="gate-aura" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="gate-card">
      <div class="gate-icon"><img src="${ICON}" alt="" width="96" height="96"></div>
      <h1 class="gate-title">いつかやること</h1>
      <div class="gate-act">${action}</div>
      <p class="gate-msg" role="alert" data-testid="gate-msg"${gateMsg ? "" : " hidden"}>${esc(gateMsg)}</p>
    </div></main>`;
}

function setGate(g: Gate) {
  if (g && !gate) {
    // アプリ画面からログイン画面へ: 開いているシートや音声入力を閉じる
    voiceAdd.abort(); voiceNote.abort();
    [settingsDlg, editorDlg, askDlg].forEach((d) => { if (d.open) d.close(); });
  }
  gate = g;
  applyTheme();
  renderShell();
}

function syncHTML() {
  const pill = (cls: string, txt: string) => `<span class="sync${cls ? " " + cls : ""}" data-testid="sync">${txt}</span>`;
  if (!authResolved || !state.ready) return pill("busy", "読み込み中…");
  if (!firebaseConfig) return pill("off", "ローカルモード(同期オフ)");
  if (!online) return pill("offline", "オフライン・あとで同期します");
  if (state.pending || Date.now() < remoteBusyUntil) return pill("busy", "同期中…");
  return pill("", "同期済み");
}

function itemHTML(t: Task, now: number) {
  const di = dueInfo(t.due);
  const f = fx.get(t.id);
  const flash = f && f.kind === "flash" && f.until > now ? " flash" : "";
  const pop = f && f.kind === "pop" && f.until > now && t.done ? " pop" : "";
  const stamp = t.done
    ? `<span class="stamp${pop}" aria-label="完了スタンプ"><b>${STAMPS[settings.stamp].t}</b><i>${t.doneAt ? md(new Date(t.doneAt)) : ""}</i></span>` : "";
  const nl = t.note ? firstLine(t.note) : "";
  const lpop = f && f.kind === "lbl" && f.until > now ? " lpop" : "";
  const chip = t.label ? `<span class="lchip ${t.label}${lpop}" data-testid="label-chip">${LABELS[t.label]}</span>` : "";
  const noteRow = t.note ? `<span class="notex" title="メモ">${I.note}<span class="nt">${linkify(nl) || "メモあり"}</span></span>` : "";
  return `<li class="item${t.done ? " done" : ""}${flash}" data-task="${esc(t.id)}">
    <label class="ck"><input type="checkbox" data-id="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="${esc(t.title)}を完了にする"><span>${I.ckSvg}</span></label>
    <div class="ibody" data-open="${esc(t.id)}"><div class="title">${esc(t.title)}</div><div class="meta"><span class="mrow"><span class="due ${di.cls}">${di.cls === "none" ? "" : I.cal}${di.txt}</span>${chip}</span>${noteRow}</div></div>
    <button type="button" class="ebtn" data-edit="${esc(t.id)}" aria-label="「${esc(t.title)}」を編集">${I.pencil}</button>${stamp}</li>`;
}

const emptyHTML = `<div class="empty"><b>まっさら！</b>いつかやりたいことを、気軽に書いておきましょう</div>`;
const loadingHTML = `<div class="loading" role="status"><span class="spin"></span>読み込み中…</div>`;

function listHTML(now: number) {
  if (!authResolved || !state.ready) return loadingHTML;
  const c = labelCounts(state.tasks);
  const tabs = `<div class="ftabs" role="group" aria-label="ラベルで絞り込み" data-testid="ftabs">${([["all", "すべて"], ["work", LABELS.work], ["private", LABELS.private]] as const)
    .map(([k, n]) => `<button type="button" class="lpill ${k}" data-flt="${k}" aria-pressed="${filter === k}">${n}<em>${c[k]}</em></button>`).join("")}</div>`;
  const l = sortTasks(filterTasks(state.tasks, filter));
  const empty = state.tasks.length ? `<div class="empty"><b>${filter === "all" ? "まっさら！" : `${LABELS[filter]}のやることはまだありません`}</b>追加するときに、ラベルを付けられます</div>` : emptyHTML;
  return tabs + (l.length ? `<ul class="list">${l.map((t) => itemHTML(t, now)).join("")}</ul>` : empty);
}

function stampHTML(now: number) {
  const { filled } = stampCardState(state.stampTotal);
  const popping = cardPop && cardPop.until > now && state.stampTotal > cardPop.from;
  const mark = stampMark(settings.stamp);
  let h = `<div class="scard" data-testid="scard" data-total="${state.stampTotal}">`;
  for (let i = 1; i <= 10; i++) {
    if (i <= filled) h += `<div class="slot on${i === filled && popping ? " pop" : ""}">${mark}</div>`;
    else h += i === 10 ? '<div class="slot goal">GOAL</div>' : `<div class="slot">${i}</div>`;
  }
  return h + "</div>";
}

function cardInfo(c: boolean) {
  const { completedCards } = stampCardState(state.stampTotal);
  const base = c ? "10 = 1 card" : "10個で1枚";
  return completedCards ? `${base} ・ ${completedCards}枚達成` : base;
}

const REGIONS: Record<string, (now: number) => string> = {
  sync: () => syncHTML(),
  list: listHTML,
  stamp: stampHTML,
  cardInfo: () => cardInfo(false),
  cardInfoC: () => cardInfo(true),
  statsA: () => {
    const s = taskStats(state.tasks);
    return `<div class="lab">叶えたこと<span>${s.pct}%</span></div><div class="big">${s.d}<small>/ ${s.all} 達成</small></div><div class="prog" style="margin-top:14px"><i style="width:${s.pct}%"></i></div>`;
  },
  statsC: () => {
    const s = taskStats(state.tasks);
    return `<div style="display:flex;align-items:flex-end;gap:16px;margin-top:12px"><div class="big">${s.pct}<small>%</small></div><div style="flex:1;padding-bottom:8px"><div class="prog"><i style="width:${s.pct}%"></i></div><div style="font-size:12px;color:var(--muted);margin-top:6px">${s.d} / ${s.all} 達成 ・ のこり ${s.left}</div></div></div>`;
  },
  statsPh: () => {
    const s = taskStats(state.tasks);
    return `<div class="ph-sum"><span>${s.d} / ${s.all} 達成</span><span class="big">${s.pct}<small>%</small></span></div><div class="prog"><i style="width:${s.pct}%"></i></div>`;
  },
  next: () => {
    const dl = upcoming(state.tasks);
    return `<div class="next">${dl.length ? dl.map((t) => `<div><b>${dueInfo(t.due).short}</b><span>${esc(t.title)}</span></div>`).join("") : '<span style="color:var(--muted);font-size:13px">期限のあるものはありません</span>'}</div>`;
  },
};

/* ================= 描画 ================= */
let shellKey = "";
const lastHTML = new WeakMap<Element, string>();
let footObs: ResizeObserver | null = null;

function addForm(): HTMLFormElement | null {
  return shell.querySelector('form[data-form="add"]');
}

function renderShell() {
  if (gate) {
    const key = `gate-${gate}-${gateBusy}-${gateMsg}`;
    if (key !== shellKey) {
      footObs?.disconnect();
      shell.innerHTML = gateHTML();
      shellKey = key;
    }
    return;
  }
  const pc = mq.matches;
  const key = `${pc ? "pc" : "ph"}-${settings.layout}`;
  if (key !== shellKey) {
    const f = addForm();
    const saved = f ? { t: (f.elements.namedItem("t") as HTMLInputElement).value, d: (f.elements.namedItem("d") as HTMLInputElement).value, focus: document.activeElement === f.elements.namedItem("t") } : null;
    voiceAdd.abort();
    shell.innerHTML = pc ? (settings.layout === "a" ? pcA() : pcC()) : phone();
    shellKey = key;
    const nf = addForm();
    if (saved && nf) {
      (nf.elements.namedItem("t") as HTMLInputElement).value = saved.t;
      (nf.elements.namedItem("d") as HTMLInputElement).value = saved.d;
      if (saved.focus) (nf.elements.namedItem("t") as HTMLInputElement).focus();
    }
    footObs?.disconnect();
    const foot = shell.querySelector(".ph-foot");
    if (foot && "ResizeObserver" in window) {
      footObs = new ResizeObserver(() => app.style.setProperty("--foot-h", `${(foot as HTMLElement).offsetHeight}px`));
      footObs.observe(foot);
    }
  }
  fill();
}

function fill() {
  const now = Date.now();
  const active = document.activeElement as HTMLElement | null;
  const focusId = active?.matches?.("input[data-id]") ? active.dataset.id : active?.matches?.("[data-flt]") ? "f:" + active.dataset.flt : active?.matches?.("[data-edit]") ? "e:" + active.dataset.edit : null;
  shell.querySelectorAll<HTMLElement>("[data-r]").forEach((el) => {
    const fn = REGIONS[el.dataset.r!];
    if (!fn) return;
    const html = fn(now);
    if (lastHTML.get(el) === html) return; // 同じ内容なら触らない(アニメーションが途切れないように)
    lastHTML.set(el, html);
    el.innerHTML = html;
  });
  const al = effectiveAddLabel();
  shell.querySelectorAll<HTMLButtonElement>(".lblpick .lpill[data-lbl]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.lbl === al));
    b.disabled = filter !== "all"; // 絞り込み中は、そのラベルで追加する
    b.title = filter !== "all" ? "絞り込み中は、そのラベルで追加されます" : "";
  });
  if (focusId && !shell.contains(active)) {
    const sel = focusId.startsWith("f:") ? `[data-flt="${CSS.escape(focusId.slice(2))}"]` : focusId.startsWith("e:") ? `[data-edit="${CSS.escape(focusId.slice(2))}"]` : `input[data-id="${CSS.escape(focusId)}"]`;
    shell.querySelector<HTMLElement>(sel)?.focus();
  }
}

let fxTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFxCleanup() {
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => {
    const now = Date.now();
    for (const [k, v] of fx) if (v.until <= now) fx.delete(k);
    if (cardPop && cardPop.until <= now) cardPop = null;
    fill();
  }, 1600);
}

/* ================= トースト ================= */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string, opt: { label?: string; action?: () => void; ms?: number } = {}) {
  const m = toastEl.querySelector(".tmsg") as HTMLElement;
  const b = toastEl.querySelector(".tact") as HTMLButtonElement;
  m.textContent = msg;
  b.hidden = !opt.action;
  b.textContent = opt.label ?? "";
  b.onclick = opt.action ? () => { hideToast(); opt.action!(); } : null;
  toastEl.classList.toggle("act", !!opt.action);
  toastEl.classList.remove("show");
  requestAnimationFrame(() => requestAnimationFrame(() => toastEl.classList.add("show")));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, opt.ms ?? (opt.action ? 6000 : 1800));
}
function hideToast() {
  toastEl.classList.remove("show", "act");
  (toastEl.querySelector(".tact") as HTMLButtonElement).onclick = null;
}

/* ================= ストア ================= */
function onStoreError(msg: string, err?: unknown) {
  console.warn(msg, err);
  const code = (err as { code?: string } | undefined)?.code;
  toast(code === "permission-denied" ? `${msg}(権限がありません)` : msg);
}

function useStore(s: Store) {
  unsubStore?.();
  unsubSettings?.();
  store = s;
  unsubStore = s.subscribe((next) => {
    if (next.remote) {
      const until = Date.now() + 1300;
      next.remote.ids.forEach((id) => fx.set(id, { kind: "flash", until }));
      remoteBusyUntil = Date.now() + 1400;
      toast(next.remote.msg);
      scheduleFxCleanup();
    }
    state = next;
    if (editingId && !state.tasks.some((t) => t.id === editingId) && editorDlg.open) {
      editorDlg.close();
      toast("このやることは、別の端末で削除されました");
    }
    fill();
  });
  unsubSettings = s.subscribeSettings((remote) => {
    if (remote) {
      settingsMissing = false;
      if (JSON.stringify(remote) !== JSON.stringify(settings)) {
        settings = remote;
        if (s !== localStore) localStore.saveSettings(settings);
        applySettings(false);
      }
    } else if (s.kind === "cloud") {
      // クラウドにまだ無ければ、今の設定をのせる(旧データの移行中は、移行が終わってから)
      if (migrating) settingsMissing = true;
      else s.saveSettings(settings);
    }
  });
}

function applySettings(save = true) {
  if (save) {
    localStore.saveSettings(settings);
    if (store.kind === "cloud") store.saveSettings(settings);
  }
  applyTheme();
  shellKey = shellKey + "?"; // スタンプ・レイアウトの変化を確実に反映
  renderShell();
  if (settingsDlg.open) fillSettings();
}

/* ================= イベント: 一覧と追加 ================= */
shell.addEventListener("change", (e) => {
  const cb = (e.target as HTMLElement).closest<HTMLInputElement>("input[type=checkbox][data-id]");
  if (!cb) return;
  const id = cb.dataset.id!;
  if (cb.checked) {
    fx.set(id, { kind: "pop", until: Date.now() + 700 });
    cardPop = { from: state.stampTotal, until: Date.now() + 1500 };
    scheduleFxCleanup();
  }
  store.setDone(id, cb.checked);
});

shell.addEventListener("submit", (e) => {
  const f = (e.target as HTMLElement).closest<HTMLFormElement>('form[data-form="add"]');
  if (!f) return;
  e.preventDefault();
  const ti = f.elements.namedItem("t") as HTMLInputElement;
  const di = f.elements.namedItem("d") as HTMLInputElement;
  const err = f.querySelector(".ferr") as HTMLElement;
  const v = validateTitle(ti.value);
  const dv = validateDue(di.value);
  if (!v.ok || !dv.ok) {
    err.textContent = !v.ok ? v.error : (dv as { error: string }).error;
    err.hidden = false;
    ti.focus();
    return;
  }
  try {
    const label = effectiveAddLabel();
    const t = store.add({ title: v.value, due: dv.value, label });
    if (label) { fx.set(t.id, { kind: "lbl", until: Date.now() + 900 }); scheduleFxCleanup(); fill(); }
    ti.value = ""; di.value = ""; err.hidden = true;
    toast("追加しました", { label: "メモを書く", action: () => openEditor(t.id, { note: true }), ms: 3500 });
  } catch (ex) {
    err.textContent = (ex as Error).message; err.hidden = false;
  }
});
shell.addEventListener("input", (e) => {
  const f = (e.target as HTMLElement).closest('form[data-form="add"]');
  if (f) (f.querySelector(".ferr") as HTMLElement).hidden = true;
});

shell.addEventListener("click", (e) => {
  const tg = e.target as HTMLElement;
  if (tg.closest('[data-act="login"]')) { void login(); return; }
  if (tg.closest('[data-act="reload"]')) { location.reload(); return; }
  if (gate) return;
  if (tg.closest('[data-act="settings"]')) { openSettings(); return; }
  const flt = tg.closest<HTMLElement>("[data-flt]");
  if (flt) { setFilter(normalizeFilter(flt.dataset.flt)); return; }
  const lb = tg.closest<HTMLButtonElement>("[data-lbl]");
  if (lb) { if (lb.disabled) return; const k = lb.dataset.lbl as Label; addLabel = addLabel === k ? "" : k; fill(); return; }
  const mic = tg.closest<HTMLElement>('[data-mic="add"]');
  if (mic) { voiceAdd.toggle(); return; }
  const ed = tg.closest<HTMLElement>("[data-edit]");
  if (ed) { openEditor(ed.dataset.edit!); return; }
  const body = tg.closest<HTMLElement>("[data-open]");
  if (body) {
    if (tg.closest("a")) return; // メモ内のリンクはそのまま開く
    if ((window.getSelection()?.toString() ?? "").length > 0) return; // 文字を選択中は開かない
    openEditor(body.dataset.open!);
  }
});

/* ================= 音声入力 ================= */
function setMicState(kind: "add" | "note", on: boolean) {
  const root = kind === "add" ? shell : editorDlg;
  root.querySelectorAll<HTMLElement>(`[data-mic="${kind}"]`).forEach((b) => {
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "音声入力を止める" : "音声で入力");
  });
  root.querySelectorAll<HTMLElement>(`[data-vstat="${kind}"]`).forEach((s) => { s.hidden = !on; });
}

const voiceAdd = new Voice({
  onText(text, final) {
    const f = addForm();
    if (!f) return;
    const ti = f.elements.namedItem("t") as HTMLInputElement;
    const di = f.elements.namedItem("d") as HTMLInputElement;
    if (!final) { ti.value = text; return; }
    // 話した文から期限を読み取り、日付欄に入れる(追加はユーザーが確認してから)
    const p = parseSpoken(text);
    ti.value = p.title.slice(0, 100);
    if (p.due) {
      di.value = p.due;
      toast(`期限を読み取りました: ${dueInfo(p.due).txt}`);
    }
    ti.focus();
  },
  onState: (on) => setMicState("add", on),
  onError: (msg) => toast(msg, { ms: 4000 }),
});

let noteBase = "";
const voiceNote = new Voice({
  onText(text, final) {
    const ta = editorDlg.querySelector<HTMLTextAreaElement>("textarea[name=note]");
    if (!ta) return;
    const sep = noteBase && !noteBase.endsWith("\n") ? "\n" : "";
    ta.value = (noteBase + sep + text).slice(0, NOTE_MAX);
    autosize(ta); updateCount();
    if (final) noteBase = ta.value;
  },
  onState(on) {
    if (on) noteBase = editorDlg.querySelector<HTMLTextAreaElement>("textarea[name=note]")?.value ?? "";
    setMicState("note", on);
  },
  onError: (msg) => toast(msg, { ms: 4000 }),
});

/* ================= 編集シート ================= */
function autosize(ta: HTMLTextAreaElement) {
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight + 2, window.innerHeight * 0.5)}px`;
}
function updateCount() {
  const ta = editorDlg.querySelector<HTMLTextAreaElement>("textarea[name=note]");
  const c = editorDlg.querySelector<HTMLElement>(".cnt");
  if (!ta || !c) return;
  c.textContent = `${ta.value.length} / ${NOTE_MAX}`;
  c.classList.toggle("over", ta.value.length >= NOTE_MAX);
}

function openEditor(id: string, opt: { note?: boolean } = {}) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  editingId = id;
  const hasNote = !!t.note;
  editorDlg.innerHTML = `<form class="sheet-in" method="dialog" novalidate>
    <div class="grab"></div>
    <div class="sheet-head"><div><small>Edit</small><h2 id="ed-h">やることを編集</h2></div><button type="button" class="iconbtn x" data-close aria-label="閉じる">${I.close}</button></div>
    <div class="sheet-body">
      <label class="fld"><span>やること</span><input type="text" name="title" maxlength="100" value="${esc(t.title)}" required></label>
      <div class="fld"><span class="fl">期限</span><div class="drow"><input type="date" name="due" value="${esc(t.due)}" aria-label="期限"><button type="button" class="ghost" data-clear-due>期限なし</button></div></div>
      <div class="fld"><span class="fl">ラベル</span><div class="lblpick" role="group" aria-label="ラベル"><input type="hidden" name="label" value="${t.label}">${(["work", "private"] as const).map((k) => `<button type="button" class="lpill ${k}" data-elbl="${k}" aria-pressed="${t.label === k}">${LABELS[k]}</button>`).join("")}</div></div>
      <div class="fld notefld">
        <div class="note-head"><span class="fl">メモ</span>${hasNote ? '<button type="button" class="linkbtn" data-note-edit>編集</button>' : ""}</div>
        ${hasNote ? `<div class="note-view" data-testid="note-view">${linkify(t.note)}</div>` : '<button type="button" class="linkbtn" data-note-edit>＋ メモを追加</button>'}
        <div class="note-edit" hidden>
          <span class="vstat" data-vstat="note" hidden>聞いています…</span>
          <textarea name="note" maxlength="${NOTE_MAX}" rows="3" aria-label="メモ" placeholder="まんがいちの時のメモ(URLも書けます)">${esc(t.note)}</textarea>
          <div class="note-foot"><span class="cnt"></span>${micBtn("note")}</div>
        </div>
      </div>
      <p class="ferr" role="alert" hidden></p>
    </div>
    <div class="sheet-acts"><button type="button" class="dghost" data-del>${I.trash}削除</button><span class="sp"></span><button type="button" class="ghost" data-close>キャンセル</button><button type="submit" class="btn">保存</button></div>
  </form>`;
  if (!editorDlg.open) editorDlg.showModal();
  if (opt.note) showNoteEdit();
  else if (mq.matches) (editorDlg.querySelector("input[name=title]") as HTMLInputElement).focus();
}

function showNoteEdit() {
  const box = editorDlg.querySelector<HTMLElement>(".note-edit");
  if (!box) return;
  box.hidden = false;
  box.style.display = "grid"; box.style.gap = "6px";
  editorDlg.querySelector(".note-view")?.remove();
  editorDlg.querySelectorAll("[data-note-edit]").forEach((b) => b.remove());
  const ta = box.querySelector("textarea")!;
  autosize(ta); updateCount();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

editorDlg.addEventListener("click", (e) => {
  const tg = e.target as HTMLElement;
  if (tg === editorDlg) { editorDlg.close(); return; } // 背景クリックで閉じる
  if (tg.closest("[data-close]")) { editorDlg.close(); return; }
  if (tg.closest("[data-clear-due]")) { (editorDlg.querySelector("input[name=due]") as HTMLInputElement).value = ""; return; }
  if (tg.closest("[data-note-edit]")) { showNoteEdit(); return; }
  const el = tg.closest<HTMLElement>("[data-elbl]");
  if (el) {
    const hid = editorDlg.querySelector<HTMLInputElement>("input[name=label]")!;
    hid.value = hid.value === el.dataset.elbl ? "" : el.dataset.elbl!;
    editorDlg.querySelectorAll<HTMLElement>("[data-elbl]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.elbl === hid.value)));
    return;
  }
  if (tg.closest('[data-mic="note"]')) { voiceNote.toggle(); return; }
  if (tg.closest("[data-del]")) {
    const id = editingId!;
    editorDlg.close();
    const removed = store.remove(id);
    if (removed) toast(`「${removed.title}」を削除しました`, { label: "元に戻す", action: () => store.restore(removed), ms: 6000 });
  }
});
editorDlg.addEventListener("input", (e) => {
  const tg = e.target as HTMLElement;
  if (tg.matches("textarea")) { autosize(tg as HTMLTextAreaElement); updateCount(); }
  (editorDlg.querySelector(".ferr") as HTMLElement | null)?.setAttribute("hidden", "");
});
editorDlg.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = editingId;
  const f = e.target as HTMLFormElement;
  const err = f.querySelector(".ferr") as HTMLElement;
  const cur = state.tasks.find((x) => x.id === id);
  if (!id || !cur) { editorDlg.close(); return; }
  const title = validateTitle((f.elements.namedItem("title") as HTMLInputElement).value);
  const due = validateDue((f.elements.namedItem("due") as HTMLInputElement).value);
  const noteBox = f.querySelector<HTMLElement>(".note-edit")!;
  const note = noteBox.hidden ? { ok: true as const, value: cur.note } : validateNote((f.elements.namedItem("note") as HTMLTextAreaElement).value);
  const label = validateLabel((f.elements.namedItem("label") as HTMLInputElement).value);
  const bad = [title, due, note, label].find((v) => !v.ok) as { error: string } | undefined;
  if (bad) { err.textContent = bad.error; err.hidden = false; return; }
  const patch = { title: (title as { value: string }).value, due: (due as { value: string }).value, note: (note as { value: string }).value, label: (label as { value: Label }).value };
  if (patch.title !== cur.title || patch.due !== cur.due || patch.note !== cur.note || patch.label !== cur.label) {
    if (patch.label && patch.label !== cur.label) { fx.set(id, { kind: "lbl", until: Date.now() + 900 }); scheduleFxCleanup(); }
    store.update(id, patch);
    toast("保存しました");
  }
  editorDlg.close();
});
editorDlg.addEventListener("close", () => { voiceNote.abort(); editingId = null; });

/* ================= 設定パネル ================= */
function previewVars() {
  const th = THEMES[settings.theme];
  return `--bg:${th.bg};--a1:${th.a1};--a2:${th.a2}`;
}
function accountHTML() {
  if (!firebaseConfig) {
    return `<div class="acct"><div class="who"><b>ローカルモード(同期オフ)</b>この端末のブラウザにだけ保存しています。スマホとパソコンで同期するには、Firebase の設定が必要です(README 参照)。</div></div>`;
  }
  return `<div class="acct"><div class="who"><b>${esc(user?.name || "ログイン中")}</b>${esc(user?.email ?? "")}</div><button type="button" class="ghost" data-logout>ログアウト</button></div>`;
}
function fillSettings() {
  const scroll = settingsDlg.querySelector(".sheet-body")?.scrollTop ?? 0;
  settingsDlg.innerHTML = `<div class="sheet-in">
    <div class="grab"></div>
    <div class="sheet-head"><div><small>Settings</small><h2 id="st-h">設定</h2></div><button type="button" class="iconbtn x" data-close aria-label="閉じる">${I.close}</button></div>
    <div class="sheet-body">
      <div class="crow"><span>レイアウト</span><div class="seg" role="group" aria-label="レイアウト">${Object.entries(LAYOUTS).map(([k, n]) => `<button type="button" data-k="layout" data-v="${k}" aria-pressed="${settings.layout === k}">${n}</button>`).join("")}</div></div>
      <div class="crow"><span>テーマ</span><div class="opts" role="group" aria-label="テーマ">${Object.entries(THEMES).map(([k, th]) => `<button type="button" class="sw" data-k="theme" data-v="${k}" aria-pressed="${settings.theme === k}"><i style="background:linear-gradient(135deg,${th.a1},${th.a2});${th.dk ? `box-shadow:inset 0 0 0 4px ${th.bg}` : ""}"></i>${th.n}</button>`).join("")}</div></div>
      <div class="crow"><span>壁紙</span><div class="opts" role="group" aria-label="壁紙">${WPS.map(([k, n]) => k === "photo"
        ? `<button type="button" class="wp up" data-k="wp" data-v="photo" aria-pressed="${settings.wp === "photo" && !!photoURL}"><i ${photoURL ? `style="background:url('${photoURL}') center/cover"` : ""}>${photoURL ? "" : "+"}</i>${n}</button>`
        : `<button type="button" class="wp" data-k="wp" data-v="${k}" aria-pressed="${settings.wp === k}"><i class="t wp-${k}" style="${previewVars()}"></i>${n}</button>`).join("")}</div></div>
      <p class="hint">「自分の写真」は<b>この端末の中だけ</b>に保存されます(クラウドには上げません)。${photoURL ? ' <button type="button" class="linkbtn" data-photo-change>写真を変える</button> <button type="button" class="linkbtn" data-photo-clear>写真を消す</button>' : ""}</p>
      <div class="crow"><span>スタンプ</span><div class="seg" role="group" aria-label="スタンプ">${Object.entries(STAMPS).map(([k, s]) => `<button type="button" data-k="stamp" data-v="${k}" aria-pressed="${settings.stamp === k}">${s.n}</button>`).join("")}</div></div>
      <div class="crow"><span>同期</span>${accountHTML()}</div>
      <div class="crow"><span>入口</span><div class="gmem"><div class="who"><b>合言葉の記憶</b>${loadSavedSlug() ? "この端末は合言葉を覚えています(入口で聞かずにひらきます)。" : "この端末は合言葉を覚えていません。"}</div><button type="button" class="ghost" data-forget-gate${loadSavedSlug() ? "" : " disabled"}>この端末の合言葉の記憶を消す</button></div></div>
      <p class="hint">音声入力について: Chrome などでは、話した音声は Google のサーバーで文字に変換されます。</p>
    </div></div>`;
  const body = settingsDlg.querySelector(".sheet-body");
  if (body) body.scrollTop = scroll;
}
function openSettings() {
  fillSettings();
  settingsDlg.showModal();
}
settingsDlg.addEventListener("click", async (e) => {
  const tg = e.target as HTMLElement;
  if (tg === settingsDlg || tg.closest("[data-close]")) { settingsDlg.close(); return; }
  if (tg.closest("[data-photo-change]")) { photoInput.click(); return; }
  if (tg.closest("[data-photo-clear]")) {
    await clearPhoto();
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = "";
    app.style.removeProperty("--photo");
    if (settings.wp === "photo") settings.wp = "mesh";
    applySettings();
    return;
  }
  if (tg.closest("[data-forget-gate]")) { forgetSlug(); fillSettings(); toast("この端末の合言葉の記憶を消しました"); return; }
  if (tg.closest("[data-logout]")) { await cloud?.signOut(); toast("ログアウトしました"); return; }
  const b = tg.closest<HTMLElement>("[data-k]");
  if (!b) return;
  const k = b.dataset.k as keyof Settings;
  const v = b.dataset.v!;
  if (k === "wp" && v === "photo" && !photoURL) { photoInput.click(); return; }
  settings = normalizeSettings({ ...settings, [k]: v });
  applySettings();
});
photoInput.addEventListener("change", async () => {
  const f = photoInput.files?.[0];
  photoInput.value = "";
  if (!f) return;
  if (!f.type.startsWith("image/")) { toast("画像ファイルを選んでください"); return; }
  try {
    const blob = await savePhoto(f);
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = URL.createObjectURL(blob);
    settings = { ...settings, wp: "photo" };
    applySettings();
  } catch (ex) {
    onStoreError("写真を保存できませんでした", ex);
  }
});

/* ================= 確認ダイアログ ================= */
function ask(title: string, msg: string, ok: string, cancel: string): Promise<boolean> {
  askDlg.innerHTML = `<div class="sheet-in"><div class="sheet-head"><h2 id="ask-h">${esc(title)}</h2></div>
    <div class="sheet-body"><p>${esc(msg)}</p></div>
    <div class="sheet-acts"><span class="sp"></span><button type="button" class="ghost" data-a="0">${esc(cancel)}</button><button type="button" class="btn" data-a="1">${esc(ok)}</button></div></div>`;
  askDlg.showModal();
  return new Promise((res) => {
    const done = (v: boolean) => { askDlg.close(); askDlg.onclick = null; askDlg.oncancel = null; res(v); };
    askDlg.onclick = (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-a]"); if (b) done(b.dataset.a === "1"); };
    askDlg.oncancel = () => done(false);
  });
}

/* ================= クラウド(設定されているときだけ) ================= */
async function login() {
  if (!cloud || gateBusy) return;
  gateBusy = true; gateMsg = ""; renderShell();
  try {
    await cloud.signIn();
  } catch (ex) {
    console.warn("ログインできませんでした", ex);
    gateMsg = "ログインできませんでした。もう一度お試しください";
  } finally {
    gateBusy = false; renderShell();
  }
}

/** クラウドのストアを外し、データを画面から消す */
function dropCloudStore() {
  unsubStore?.(); unsubSettings?.();
  unsubStore = null; unsubSettings = null;
  if (store !== localStore) store.dispose();
  store = localStore;
  state = { ...EMPTY_STATE };
}

async function startCloud() {
  const { initCloud } = await import("./store/cloud");
  cloud = initCloud(firebaseConfig!, useEmulator);
  if (cloud.testSignIn) (window as unknown as Record<string, unknown>).__someday = { testSignIn: cloud.testSignIn, signOut: cloud.signOut, uid: cloud.testUid };
  cloud.onUser(async (u) => {
    if (u && !isAllowedAccount(u.email, u.emailVerified)) {
      // 許可されていないアカウント: すぐログアウトし、アプリ画面は描画しない(どれが許可かは出さない)
      user = null; authResolved = true;
      dropCloudStore();
      gateMsg = "このアカウントでは使えません";
      setGate("login");
      try { await cloud!.signOut(); } catch (ex) { console.warn(ex); }
      return;
    }
    const changed = (u?.uid ?? null) !== (user?.uid ?? null) || !authResolved;
    user = u;
    authResolved = true;
    if (!changed) { fill(); return; }
    dropCloudStore();
    if (u) {
      gateMsg = "";
      const fs = cloud!.createStore(onStoreError) as FirestoreStore;
      const local = localStore.snapshot();
      migrating = true; settingsMissing = false;
      useStore(fs);
      setGate(null);
      // 以前の「アカウントごとのリスト」が残っていれば、共有リストへ移す(移したら旧データは消すので一度だけ)
      cloud!.migrateLegacy(u.uid).then((r) => {
        if (r && r.moved > 0 && store === fs) toast(`以前のリストから ${r.moved} 件を移しました`);
      }).catch((ex) => console.warn("以前のリストを移せませんでした(次に開いたときにやり直します)", ex))
        .finally(() => {
          if (store !== fs) return;
          migrating = false;
          if (settingsMissing) { settingsMissing = false; fs.saveSettings(settings); }
        });
      if (local.tasks.length) {
        const ok = await ask("この端末のやることを取り込みますか？", `ログイン前にこの端末で書いた ${local.tasks.length} 件があります。アカウントに取り込んで、ほかの端末と同期しますか？`, "取り込む", "今はしない");
        if (ok) { fs.importTasks(local.tasks, local.stampTotal); localStore.clearTasks(); toast(`${local.tasks.length} 件を取り込みました`); }
      }
    } else {
      // 未ログイン: クラウド設定ありのビルドでは「この端末だけ」のモードは使わず、ログイン画面だけを出す
      setGate("login");
    }
    if (settingsDlg.open) fillSettings();
    fill();
  });
}

/* ================= 起動 ================= */
window.addEventListener("online", () => { online = true; fill(); });
window.addEventListener("offline", () => { online = false; fill(); });
mq.addEventListener("change", () => renderShell());

applyTheme();
renderShell();
if (firebaseConfig) {
  startCloud().catch((e) => {
    console.warn("クラウドに接続できませんでした", e);
    authResolved = true;
    gateMsg = "接続できませんでした。通信状況を確かめて、再読み込みしてください";
    setGate("error");
  });
} else {
  useStore(localStore);
}
loadPhoto().then((blob) => {
  if (!blob) return;
  photoURL = URL.createObjectURL(blob);
  applyTheme();
  if (settingsDlg.open) fillSettings();
});

if (import.meta.env.PROD) {
  import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true })).catch(() => { /* SW 非対応 */ });
}
