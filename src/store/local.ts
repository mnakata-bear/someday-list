import type { NewTaskInput, Settings, Task, TaskPatch } from "../core/types";
import { applyStampDelta, diffTasks, normalizeLabel, normalizeSettings, validateDue, validateLabel, validateNote, validateTitle } from "../core/logic";
import type { Store, StoreState } from "./types";

export const TASKS_KEY = "someday-tasks-v1";
export const SETTINGS_KEY = "someday-settings-v1";

interface Saved { tasks: Task[]; stampTotal: number }

export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "").slice(0, 20);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** 入力を検証して Task に整える(LocalStore / FirestoreStore 共通) */
export function buildTask(input: NewTaskInput, id: string, now: number): Task {
  const title = validateTitle(input.title);
  if (!title.ok) throw new Error(title.error);
  const due = validateDue(input.due);
  if (!due.ok) throw new Error(due.error);
  const note = validateNote(input.note ?? "");
  if (!note.ok) throw new Error(note.error);
  const label = validateLabel(input.label ?? "");
  if (!label.ok) throw new Error(label.error);
  return { id, title: title.value, due: due.value, note: note.value, label: label.value, done: false, doneAt: null, createdAt: now, updatedAt: now };
}

export function cleanPatch(patch: TaskPatch): TaskPatch {
  const out: TaskPatch = {};
  if (patch.title !== undefined) { const v = validateTitle(patch.title); if (!v.ok) throw new Error(v.error); out.title = v.value; }
  if (patch.due !== undefined) { const v = validateDue(patch.due); if (!v.ok) throw new Error(v.error); out.due = v.value; }
  if (patch.note !== undefined) { const v = validateNote(patch.note); if (!v.ok) throw new Error(v.error); out.note = v.value; }
  if (patch.label !== undefined) { const v = validateLabel(patch.label); if (!v.ok) throw new Error(v.error); out.label = v.value; }
  return out;
}

/** 古いデータや壊れたデータを読み込んでも落ちないように整える */
function sanitize(raw: unknown): Saved {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Saved>;
  const tasks = Array.isArray(r.tasks) ? r.tasks.filter((t) => t && typeof t.id === "string" && typeof t.title === "string").map((t) => ({
    id: t.id, title: t.title, due: typeof t.due === "string" ? t.due : "", note: typeof t.note === "string" ? t.note : "", label: normalizeLabel((t as { label?: unknown }).label),
    done: !!t.done, doneAt: typeof t.doneAt === "number" ? t.doneAt : null,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : 0, updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : 0,
  })) : [];
  return { tasks, stampTotal: applyStampDelta(Number(r.stampTotal) || 0, 0) };
}

/** 端末内(localStorage)だけに保存するストア。別タブの変更は storage イベントで受け取る */
export class LocalStore implements Store {
  readonly kind = "local" as const;
  private data: Saved;
  private subs = new Set<(s: StoreState) => void>();
  private setSubs = new Set<(s: Settings | null) => void>();
  private onStorage = (e: StorageEvent) => {
    if (e.key === TASKS_KEY) {
      const prev = this.data.tasks;
      this.data = this.read();
      this.emit(diffTasks(prev, this.data.tasks));
    } else if (e.key === SETTINGS_KEY) {
      const s = this.readSettings();
      this.setSubs.forEach((cb) => cb(s));
    }
  };

  constructor(private storage: Storage = localStorage, private now: () => number = Date.now) {
    this.data = this.read();
    if (typeof window !== "undefined") window.addEventListener("storage", this.onStorage);
  }

  private read(): Saved {
    try { return sanitize(JSON.parse(this.storage.getItem(TASKS_KEY) || "null")); } catch { return sanitize(null); }
  }
  private write() {
    this.storage.setItem(TASKS_KEY, JSON.stringify(this.data));
  }
  private state(remote: StoreState["remote"] = null): StoreState {
    return { tasks: this.data.tasks.map((t) => ({ ...t })), stampTotal: this.data.stampTotal, ready: true, pending: false, remote };
  }
  private emit(remote: StoreState["remote"] = null) {
    const s = this.state(remote);
    this.subs.forEach((cb) => cb(s));
  }
  private commit() { this.write(); this.emit(); }

  subscribe(cb: (s: StoreState) => void) {
    this.subs.add(cb);
    cb(this.state());
    return () => { this.subs.delete(cb); };
  }

  /** 現在のタスク(クラウドへの取り込み用) */
  snapshot(): Saved { return { tasks: this.data.tasks.map((t) => ({ ...t })), stampTotal: this.data.stampTotal }; }
  clearTasks() { this.data = { tasks: [], stampTotal: 0 }; this.commit(); }

  add(input: NewTaskInput): Task {
    const t = buildTask(input, newId(), this.now());
    this.data.tasks.push(t);
    this.commit();
    return { ...t };
  }

  update(id: string, patch: TaskPatch) {
    const t = this.data.tasks.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, cleanPatch(patch), { updatedAt: this.now() });
    this.commit();
  }

  setDone(id: string, done: boolean) {
    const t = this.data.tasks.find((x) => x.id === id);
    if (!t || t.done === done) return;
    t.done = done;
    t.doneAt = done ? this.now() : null;
    t.updatedAt = this.now();
    this.data.stampTotal = applyStampDelta(this.data.stampTotal, done ? 1 : -1);
    this.commit();
  }

  remove(id: string) {
    const i = this.data.tasks.findIndex((x) => x.id === id);
    if (i < 0) return undefined;
    const [t] = this.data.tasks.splice(i, 1);
    this.commit();
    return t;
  }

  restore(task: Task) {
    if (this.data.tasks.some((x) => x.id === task.id)) return;
    this.data.tasks.push({ ...task });
    this.commit();
  }

  private readSettings(): Settings | null {
    try {
      const raw = this.storage.getItem(SETTINGS_KEY);
      return raw ? normalizeSettings(JSON.parse(raw)) : null;
    } catch { return null; }
  }
  subscribeSettings(cb: (s: Settings | null) => void) {
    this.setSubs.add(cb);
    cb(this.readSettings());
    return () => { this.setSubs.delete(cb); };
  }
  saveSettings(s: Settings) {
    try { this.storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(s))); } catch { /* 容量不足などは無視 */ }
  }

  dispose() {
    this.subs.clear();
    this.setSubs.clear();
    if (typeof window !== "undefined") window.removeEventListener("storage", this.onStorage);
  }
}
