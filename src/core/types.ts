/** ラベル。"" は未設定 */
export type Label = "work" | "private" | "";
export const LABELS: Record<"work" | "private", string> = { work: "仕事", private: "プライベート" };

export interface Task {
  id: string;
  title: string;
  /** "YYYY-MM-DD" または ""(期限なし) */
  due: string;
  /** メモ(任意・最大2000字) */
  note: string;
  /** ラベル(任意)。未設定は "" */
  label: Label;
  done: boolean;
  /** 完了にした日時(ms)。未完了なら null */
  doneAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type LayoutKey = "a" | "c";
export type StampKey = "sumi" | "kanryo" | "done" | "good";

export interface Settings {
  layout: LayoutKey;
  theme: string;
  wp: string;
  stamp: StampKey;
}

export const DEFAULT_SETTINGS: Settings = { layout: "a", theme: "penguin", wp: "mesh", stamp: "sumi" };

export interface NewTaskInput {
  title: string;
  due: string;
  note?: string;
  label?: Label;
}

export interface TaskPatch {
  title?: string;
  due?: string;
  note?: string;
  label?: Label;
}
