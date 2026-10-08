/* 「自分の写真」壁紙。写真はこの端末の IndexedDB だけに保存し、クラウドには上げない */
const DB = "someday-photo";
const STORE = "kv";
const KEY = "wallpaper";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((res, rej) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } finally { db.close(); }
}

export async function loadPhoto(): Promise<Blob | null> {
  try { return ((await tx("readonly", (s) => s.get(KEY))) as Blob | undefined) ?? null; } catch { return null; }
}

export async function savePhoto(file: Blob): Promise<Blob> {
  const blob = await shrink(file);
  await tx("readwrite", (s) => s.put(blob, KEY));
  return blob;
}

export async function clearPhoto(): Promise<void> {
  try { await tx("readwrite", (s) => s.delete(KEY)); } catch { /* なし */ }
}

/** 大きすぎる写真は長辺 2400px 程度に縮めて保存(端末の容量を節約) */
async function shrink(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const max = 2400;
    const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (r >= 1 && file.size < 3_000_000) { bmp.close(); return file; }
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * r);
    c.height = Math.round(bmp.height * r);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.86));
  } catch {
    return file;
  }
}
