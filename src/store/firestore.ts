import {
  collection, deleteDoc, doc, increment, onSnapshot, setDoc, updateDoc, writeBatch,
  type DocumentData, type Firestore, type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { NewTaskInput, Settings, Task, TaskPatch } from "../core/types";
import { applyStampDelta, diffTasks, normalizeSettings } from "../core/logic";
import type { ErrorSink, Store, StoreState } from "./types";
import { buildTask, cleanPatch } from "./local";

/**
 * Cloud Firestore に保存するストア。
 *   users/{uid}/tasks/{taskId}  … タスク
 *   users/{uid}/meta/settings   … 見た目の設定
 *   users/{uid}/meta/stats      … スタンプの累計
 * オフライン中の書き込みは端末内のキャッシュ(persistentLocalCache)に入り、復帰時に送られる。
 * そのため書き込みの Promise は待たずに、onSnapshot の結果で画面を更新する。
 */
export class FirestoreStore implements Store {
  readonly kind = "cloud" as const;
  private tasks: Task[] = [];
  private stampTotal = 0;
  private ready = false;
  private pendingTasks = false;
  private pendingStats = false;
  private first = true;
  private subs = new Set<(s: StoreState) => void>();
  private unsubs: (() => void)[] = [];
  private readyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private db: Firestore, private uid: string, private onError: ErrorSink, private now: () => number = Date.now) {
    const tasksCol = this.tasksCol();
    this.unsubs.push(onSnapshot(tasksCol, { includeMetadataChanges: true }, (snap) => {
      const next = snap.docs.map(toTask);
      let remote: StoreState["remote"] = null;
      if (!this.first) {
        const changes = snap.docChanges();
        const ids = new Set<string>();
        for (const c of changes) {
          const fromOther = c.type === "removed" ? !snap.metadata.hasPendingWrites : !c.doc.metadata.hasPendingWrites;
          if (fromOther) ids.add(c.doc.id);
        }
        if (ids.size) remote = diffTasks(this.tasks.filter((t) => ids.has(t.id)), next.filter((t) => ids.has(t.id)));
      }
      this.first = false;
      this.tasks = next;
      this.pendingTasks = snap.metadata.hasPendingWrites;
      // 新しい端末ではキャッシュが空のまま最初に届くので、サーバーの結果を少し待つ
      const online = typeof navigator === "undefined" || navigator.onLine;
      if (!this.ready && (!snap.metadata.fromCache || !online || next.length > 0)) this.ready = true;
      if (!this.ready && !this.readyTimer) this.readyTimer = setTimeout(() => { this.ready = true; this.emit(null); }, 2500);
      this.emit(remote);
    }, (err) => this.onError("クラウドからの読み込みに失敗しました", err)));

    this.unsubs.push(onSnapshot(this.statsRef(), { includeMetadataChanges: true }, (snap) => {
      this.stampTotal = applyStampDelta(Number(snap.data()?.stampTotal) || 0, 0);
      this.pendingStats = snap.metadata.hasPendingWrites;
      this.emit(null);
    }, (err) => this.onError("スタンプの読み込みに失敗しました", err)));
  }

  private tasksCol() { return collection(this.db, "users", this.uid, "tasks"); }
  private taskRef(id: string) { return doc(this.db, "users", this.uid, "tasks", id); }
  private statsRef() { return doc(this.db, "users", this.uid, "meta", "stats"); }
  private settingsRef() { return doc(this.db, "users", this.uid, "meta", "settings"); }

  private emit(remote: StoreState["remote"]) {
    const s: StoreState = {
      tasks: this.tasks.map((t) => ({ ...t })), stampTotal: this.stampTotal, ready: this.ready,
      pending: this.pendingTasks || this.pendingStats, remote,
    };
    this.subs.forEach((cb) => cb(s));
  }
  private fail = (msg: string) => (err: unknown) => this.onError(msg, err);

  subscribe(cb: (s: StoreState) => void) {
    this.subs.add(cb);
    cb({ tasks: this.tasks, stampTotal: this.stampTotal, ready: this.ready, pending: this.pendingTasks || this.pendingStats, remote: null });
    return () => { this.subs.delete(cb); };
  }

  add(input: NewTaskInput): Task {
    const id = doc(this.tasksCol()).id;
    const t = buildTask(input, id, this.now());
    setDoc(this.taskRef(id), toData(t)).catch(this.fail("追加をクラウドに保存できませんでした"));
    return t;
  }

  update(id: string, patch: TaskPatch) {
    const p = cleanPatch(patch);
    updateDoc(this.taskRef(id), { ...p, updatedAt: this.now() }).catch(this.fail("変更をクラウドに保存できませんでした"));
  }

  setDone(id: string, done: boolean) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.done === done) return;
    const now = this.now();
    const b = writeBatch(this.db);
    b.update(this.taskRef(id), { done, doneAt: done ? now : null, updatedAt: now });
    // 完了で +1、取消で -1(0 未満にはしない)
    if (done) b.set(this.statsRef(), { stampTotal: increment(1) }, { merge: true });
    else if (this.stampTotal > 0) b.set(this.statsRef(), { stampTotal: increment(-1) }, { merge: true });
    b.commit().catch(this.fail("チェックをクラウドに保存できませんでした"));
  }

  remove(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    deleteDoc(this.taskRef(id)).catch(this.fail("削除をクラウドに反映できませんでした"));
    return t ? { ...t } : undefined;
  }

  restore(task: Task) {
    setDoc(this.taskRef(task.id), toData(task)).catch(this.fail("元に戻せませんでした"));
  }

  /** ログイン前に端末で作ったタスクを取り込む */
  importTasks(tasks: Task[], stampTotal: number) {
    const b = writeBatch(this.db);
    for (const t of tasks) b.set(this.taskRef(t.id), toData(t));
    if (stampTotal > 0) b.set(this.statsRef(), { stampTotal: increment(stampTotal) }, { merge: true });
    b.commit().catch(this.fail("取り込みに失敗しました"));
  }

  subscribeSettings(cb: (s: Settings | null) => void) {
    const un = onSnapshot(this.settingsRef(), (snap) => cb(snap.exists() ? normalizeSettings(snap.data()) : null),
      (err) => this.onError("設定の読み込みに失敗しました", err));
    this.unsubs.push(un);
    return un;
  }

  saveSettings(s: Settings) {
    const v = normalizeSettings(s);
    setDoc(this.settingsRef(), { layout: v.layout, theme: v.theme, wp: v.wp, stamp: v.stamp }).catch(this.fail("設定をクラウドに保存できませんでした"));
  }

  dispose() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.subs.clear();
    clearTimeout(this.readyTimer);
  }
}

function toData(t: Task) {
  return { title: t.title, due: t.due, note: t.note, done: t.done, doneAt: t.doneAt, createdAt: t.createdAt, updatedAt: t.updatedAt };
}

function toTask(d: QueryDocumentSnapshot<DocumentData>): Task {
  const x = d.data();
  return {
    id: d.id,
    title: String(x.title ?? ""),
    due: typeof x.due === "string" ? x.due : "",
    note: typeof x.note === "string" ? x.note : "",
    done: !!x.done,
    doneAt: typeof x.doneAt === "number" ? x.doneAt : null,
    createdAt: typeof x.createdAt === "number" ? x.createdAt : 0,
    updatedAt: typeof x.updatedAt === "number" ? x.updatedAt : 0,
  };
}
