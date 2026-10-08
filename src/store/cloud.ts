/* Firebase の初期化とログイン。firebase-config が設定されているときだけ動的に読み込まれる */
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider, browserLocalPersistence, connectAuthEmulator, getRedirectResult, indexedDBLocalPersistence,
  initializeAuth, browserPopupRedirectResolver, onAuthStateChanged, signInWithCredential, signInWithPopup,
  signInWithRedirect, signOut, type User,
} from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import type { FirebaseWebConfig } from "../firebase-config";
import { ALLOWED_EMAILS } from "../core/access";
import { FirestoreStore } from "./firestore";
import { migrateLegacy, type MigrationResult } from "./migrate";
import type { ErrorSink } from "./types";

export interface CloudUser { uid: string; name: string; email: string; emailVerified: boolean }

export interface Cloud {
  onUser(cb: (u: CloudUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** 共有スペース(spaces/home)のストア。どの許可アカウントでも同じリストになる */
  createStore(onError: ErrorSink): FirestoreStore;
  /** 旧データ users/{uid}/... があれば共有スペースへ移す(無ければ null) */
  migrateLegacy(uid: string): Promise<MigrationResult | null>;
  /** エミュレーター専用: Google の偽トークンでログイン(E2E テスト用)。email の既定は許可アカウント */
  testSignIn?(sub: string, email?: string, emailVerified?: boolean): Promise<void>;
  /** エミュレーター専用: いまログインしている uid(E2E テスト用) */
  testUid?(): string | null;
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

  const toInfo = (u: User | null): CloudUser | null => (u ? { uid: u.uid, name: u.displayName ?? "", email: u.email ?? "", emailVerified: u.emailVerified } : null);

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
    createStore: (onError) => new FirestoreStore(db, onError),
    migrateLegacy: (uid) => migrateLegacy(db, uid),
  };
  if (emulator) {
    cloud.testSignIn = async (sub: string, email: string = ALLOWED_EMAILS[0], emailVerified = true) => {
      const cred = GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: emailVerified, name: sub }));
      await signInWithCredential(auth, cred);
    };
    cloud.testUid = () => auth.currentUser?.uid ?? null;
  }
  return cloud;
}
