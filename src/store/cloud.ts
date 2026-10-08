/* Firebase の初期化とログイン。firebase-config が設定されているときだけ動的に読み込まれる */
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider, browserLocalPersistence, connectAuthEmulator, getRedirectResult, indexedDBLocalPersistence,
  initializeAuth, browserPopupRedirectResolver, onAuthStateChanged, signInWithCredential, signInWithPopup,
  signInWithRedirect, signOut, type User,
} from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import type { FirebaseWebConfig } from "../firebase-config";
import { FirestoreStore } from "./firestore";
import type { ErrorSink } from "./types";

export interface Cloud {
  onUser(cb: (u: { uid: string; name: string; email: string } | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  createStore(uid: string, onError: ErrorSink): FirestoreStore;
  /** エミュレーター専用: Google の偽トークンでログイン(E2E テスト用) */
  testSignIn?(sub: string): Promise<void>;
}

export function initCloud(cfg: FirebaseWebConfig, emulator: boolean): Cloud {
  const app = initializeApp(cfg);
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  auth.languageCode = "ja";
  // オフラインでも追加・チェックできるよう、端末内キャッシュを有効にする(複数タブ対応)
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  if (emulator) {
    const host = location.hostname || "127.0.0.1";
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }
  getRedirectResult(auth).catch(() => { /* リダイレクトでなければ何もしない */ });

  const toInfo = (u: User | null) => (u ? { uid: u.uid, name: u.displayName ?? "", email: u.email ?? "" } : null);

  const cloud: Cloud = {
    onUser: (cb) => onAuthStateChanged(auth, (u) => cb(toInfo(u))),
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        const code = (e as { code?: string }).code ?? "";
        // ポップアップが使えない環境(ホーム画面から起動した PWA など)はリダイレクトで
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
          await signInWithRedirect(auth, provider);
          return;
        }
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
        throw e;
      }
    },
    signOut: () => signOut(auth),
    createStore: (uid, onError) => new FirestoreStore(db, uid, onError),
  };
  if (emulator) {
    cloud.testSignIn = async (sub: string) => {
      const cred = GoogleAuthProvider.credential(JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true, name: sub }));
      await signInWithCredential(auth, cred);
    };
  }
  return cloud;
}
