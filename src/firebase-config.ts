/**
 * Firebase の設定。
 * .env.local などに VITE_FIREBASE_* を書くと、クラウド同期モードになります(書き方は README)。
 * 未設定(apiKey か projectId が空)なら null を返し、アプリは「ローカルモード(同期オフ)」で動きます。
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

const env = import.meta.env;

export const firebaseConfig: FirebaseWebConfig | null =
  env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
        appId: env.VITE_FIREBASE_APP_ID || "",
      }
    : null;

/** "1" ならローカルの Firebase Emulator(auth:9099 / firestore:8080)につなぐ(テスト用) */
export const useEmulator = env.VITE_USE_EMULATOR === "1";
