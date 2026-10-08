import type { NewTaskInput, Settings, Task, TaskPatch } from "../core/types";
import type { RemoteChange } from "../core/logic";

export interface StoreState {
  tasks: Task[];
  stampTotal: number;
  /** 最初のデータを受け取ったか(読み込み中表示に使う) */
  ready: boolean;
  /** サーバー未反映の書き込みがあるか(クラウドのみ) */
  pending: boolean;
  /** 他の端末(タブ)からの変更。自分の操作による更新なら null */
  remote: RemoteChange | null;
}

/** ストレージ層の共通インターフェース(LocalStore / FirestoreStore) */
export interface Store {
  readonly kind: "local" | "cloud";
  subscribe(cb: (s: StoreState) => void): () => void;
  add(input: NewTaskInput): Task;
  update(id: string, patch: TaskPatch): void;
  setDone(id: string, done: boolean): void;
  remove(id: string): Task | undefined;
  /** 削除の取り消し用。同じ id のまま戻す */
  restore(task: Task): void;
  /** 設定。未保存なら null */
  subscribeSettings(cb: (s: Settings | null) => void): () => void;
  saveSettings(s: Settings): void;
  dispose(): void;
}

/** 書き込み失敗などを UI に知らせる */
export type ErrorSink = (msg: string, err?: unknown) => void;
