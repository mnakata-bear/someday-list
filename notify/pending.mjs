// 削除の保留(「元に戻す」の猶予)。schedule すると delayMs 後に commit(id) を呼ぶ。
// それまでに undo(id) すれば取り消せる。flush() は、待っているものを今すぐ確定する(ダイアログを閉じるとき)。
export function createDeferred({ delayMs = 6000, commit, onError, setT = setTimeout, clearT = clearTimeout }) {
  const pending = new Map(); // id -> timer

  async function run(id) {
    if (!pending.has(id)) return;
    pending.delete(id);
    try { await commit(id); } catch (e) { onError?.(id, e); }
  }

  return {
    /** 保留を始める。すでに保留中なら何もしない */
    schedule(id) {
      if (pending.has(id)) return false;
      pending.set(id, setT(() => { run(id); }, delayMs));
      return true;
    },
    /** 取り消す。保留中だった(=間に合った)なら true */
    undo(id) {
      if (!pending.has(id)) return false;
      clearT(pending.get(id));
      pending.delete(id);
      return true;
    },
    has: (id) => pending.has(id),
    get size() { return pending.size; },
    /** 待っているものを今すぐ全部確定する */
    async flush() {
      const ids = [...pending.keys()];
      for (const id of ids) { clearT(pending.get(id)); await run(id); }
    },
  };
}
