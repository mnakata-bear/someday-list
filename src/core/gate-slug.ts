/**
 * 合言葉 → アプリ本体の置き場所(slug)。
 *   slug = SHA-256("someday-list:" + 合言葉) の 16 進の先頭 24 文字
 *   アプリは /someday-list/app-<slug>/ に置く(GitHub Actions が secret APP_PASSPHRASE から同じ計算をする)。
 * scripts/slug.mjs(Node 版)と同じ結果になること(tests/unit/gate-slug.test.ts)。
 */
export const SLUG_PREFIX = "someday-list:";
export const SLUG_LEN = 24;
/** 一度通った端末で slug を覚えておく localStorage のキー(入口ページとアプリで共有) */
export const GATE_KEY = "someday-list:gate-slug";

/** 入力の揺れ(前後の空白・全角/半角の合成)をそろえる */
export function normalizePassphrase(s: string): string {
  return s.normalize("NFC").trim();
}

export async function slugFor(passphrase: string): Promise<string> {
  const data = new TextEncoder().encode(SLUG_PREFIX + normalizePassphrase(passphrase));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, SLUG_LEN);
}

export const isSlug = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{24}$/.test(s);

/** 端末に覚えた slug(読めない・壊れているときは null) */
export function loadSavedSlug(): string | null {
  try {
    const v = localStorage.getItem(GATE_KEY);
    return isSlug(v) ? v : null;
  } catch { return null; }
}
export function saveSlug(slug: string): void {
  try { localStorage.setItem(GATE_KEY, slug); } catch { /* 保存できなくても通過はできる */ }
}
export function forgetSlug(): void {
  try { localStorage.removeItem(GATE_KEY); } catch { /* noop */ }
}
