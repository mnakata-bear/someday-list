/**
 * このアプリを使える Google アカウント(クライアント側の判定は見た目のため)。
 * 守りの本体は firestore.rules の allowedEmail()。メールを増やすときは、ここと rules の両方を直す。
 */
export const ALLOWED_EMAILS: readonly string[] = ["bears.sys.apps@gmail.com"];

/** 許可リストにあり、メールが確認済みのアカウントか */
export function isAllowedAccount(email: string | null | undefined, emailVerified: boolean): boolean {
  if (!emailVerified || !email) return false;
  return ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
