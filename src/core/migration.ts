import type { Settings, Task } from "./types";
import { normalizeSettings } from "./logic";

/** 旧データ(users/{uid}/...)の中身 */
export interface LegacyData {
  tasks: Task[];
  stampTotal: number;
  /** 旧 settings ドキュメント。無ければ null */
  settings: unknown | null;
}

/** 共有スペース(spaces/home)の今の状態 */
export interface SharedState {
  taskIds: ReadonlySet<string>;
  stampTotal: number;
  hasSettings: boolean;
}

export interface MigrationPlan {
  /** 共有スペースへコピーするタスク(同じ ID が共有側にあるものは上書きしないので含めない) */
  copy: Task[];
  /** スタンプ累計に足す数(大きいほうに合わせる。0 なら書かない) */
  stampDelta: number;
  /** 共有側に設定が無いときだけコピーする設定 */
  settings: Settings | null;
}

/** 旧データがあるか(移行が必要か) */
export function hasLegacyData(l: LegacyData): boolean {
  return l.tasks.length > 0 || l.stampTotal > 0 || l.settings != null;
}

/** rules の検証を通る形か(通らないものは移さない) */
function isValidTask(t: Task): boolean {
  return t.id.length >= 1 && t.id.length <= 64
    && t.title.length >= 1 && t.title.length <= 100
    && (t.due === "" || /^\d{4}-\d{2}-\d{2}$/.test(t.due))
    && t.note.length <= 2000
    && (t.label === "" || t.label === "work" || t.label === "private")
    && Number.isInteger(t.createdAt) && Number.isInteger(t.updatedAt)
    && (t.doneAt === null || Number.isInteger(t.doneAt));
}

/**
 * 旧データを共有スペースへ移すときの計画。
 *  - タスク: 共有側に無い ID だけ追加(重複 ID は共有側を優先し、上書きしない)
 *  - スタンプ累計: 旧と共有の大きいほう
 *  - 設定: 共有側に無ければ旧の設定をコピー
 */
export function planMigration(legacy: LegacyData, shared: SharedState): MigrationPlan {
  const copy = legacy.tasks.filter((t) => !shared.taskIds.has(t.id) && isValidTask(t));
  const legacyTotal = Math.max(0, Math.floor(legacy.stampTotal) || 0);
  const sharedTotal = Math.max(0, Math.floor(shared.stampTotal) || 0);
  return {
    copy,
    stampDelta: Math.max(0, legacyTotal - sharedTotal),
    settings: !shared.hasSettings && legacy.settings != null ? normalizeSettings(legacy.settings) : null,
  };
}
