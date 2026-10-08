# いつかやることリスト(PWA)

期限はあってもなくてもいい「いつかやりたいこと」を書きためるリストです。
スマホとパソコンで同期でき(Firebase)、ホーム画面に追加してアプリのように使えます(PWA)。

- 公開予定: https://mnakata-bear.github.io/someday-list/
- デザイン: `G:\AI\mock_todo_sync\index.html`(確定モック)を移植
- 構成: Vite + TypeScript(フレームワークなし) / Firebase Authentication(Google)+ Cloud Firestore / vite-plugin-pwa

## 主な機能

- やることの追加(期限は任意)・チェック・編集・削除(「元に戻す」つき)
- 期限の表示: 期限なし=「いつでも」、あと◯日、14日以内は色付き、過ぎたら赤の「期限切れ」
- チェックするとスタンプ(済 / 完了 / DONE / よくできました)。スタンプカードは10個で1枚
- メモ(任意・2000字まで)。一覧にはメモのあるものだけ小さく1行目を表示。URL はリンクになる
- 音声入力(マイクボタン)。「来週の金曜までに歯医者を予約」のように話すと、期限を読み取って日付欄に入れる(追加は確認してから)
- テーマ12種・壁紙10種+自分の写真・レイアウト2種(A カード / C タイル)を設定(歯車ボタン)で切り替え
- 幅 900px 以上はパソコン用、900px 未満はスマホ用レイアウト(追加フォームは下に固定)
- オフラインでも起動・追加・チェックでき、つながったら同期

### 保存先

| もの | ログイン中 | 未ログイン / ローカルモード |
|---|---|---|
| やること・スタンプ累計 | Firestore `users/{uid}/tasks/{taskId}`、`users/{uid}/meta/stats` | この端末の localStorage |
| 設定(テーマなど) | Firestore `users/{uid}/meta/settings`(端末にも控え) | この端末の localStorage |
| 自分の写真(壁紙) | **この端末の IndexedDB だけ**(クラウドには上げない) | 同じ |

### 音声入力について

Web Speech API を使います。**Chrome などでは、話した音声は Google のサーバーで文字に変換されます。**
対応していないブラウザではマイクボタンは表示されません(キーボードのマイク入力を使ってください)。

## モード

- **クラウドモード**: `VITE_FIREBASE_*` が設定されているビルド(本番)。**許可された Google アカウント(`bears.sys.apps@gmail.com`)でログインするまで、ログイン画面だけを表示**し、一覧・追加フォーム・設定などは描画しません。
  - 許可外のアカウントでログインすると、すぐログアウトして「このアカウントでは使えません」と表示します
  - 「未ログイン(この端末のみ)」で使うモードはありません
  - 許可リストは `src/core/access.ts`(見た目用)と `firestore.rules` の `allowedEmail()`(守りの本体)。増やすときは両方を直す
  - 検索エンジン避けに `noindex, nofollow` の meta と `public/robots.txt` を入れています
  本番の設定は `.env.production` に入っています(Web の config は公開前提の値)。GitHub Actions のビルドはリポジトリの Variables から受け取ります。
- **ローカルモード(同期オフ)**: `VITE_FIREBASE_*` が無いとき。localStorage だけで動き、ヘッダーに「ローカルモード(同期オフ)」と出ます。
  `npm run dev` とテスト用ビルドはこちらです。

## Firebase の準備(手順の記録)

本番プロジェクト `itupo-app` は作成済みです。新しく作り直すときの手順:

1. [Firebase コンソール](https://console.firebase.google.com/)でプロジェクトを作成(Google アナリティクスは不要)
2. 「プロジェクトの設定」→「マイアプリ」→ ウェブアプリ(`</>`)を追加し、表示される config を控える
3. config を `.env.production` に書く(`VITE_FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` / `STORAGE_BUCKET` / `MESSAGING_SENDER_ID` / `APP_ID`)
   - 手元だけで試すなら `.env.local`(git に入らない)でも可
4. 「Authentication」→「ログイン方法」で **Google** を有効にする
5. 「Authentication」→「設定」→「承認済みドメイン」に **`mnakata-bear.github.io`** を追加(`localhost` は最初から入っている)
6. 「Firestore Database」を作成(ロケーションは `asia-northeast1` など)
7. セキュリティルールをデプロイ:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules --project itupo-app
```

`.firebaserc` の default は `itupo-app` です。インデックスが必要なクエリは使っていません(`firestore.indexes.json` は空)。

### セキュリティルール(`firestore.rules`)

- 許可リストのメール(`email_verified == true`)でログインし、`request.auth.uid == userId` の本人だけが `users/{userId}/...` を読み書きできる。それ以外はすべて拒否
- タスク: `title` は 1〜100 字の文字列、`due` は `""` か `YYYY-MM-DD`、`note` は 2000 字以内の文字列、`done` は bool、日時は整数(ms)、余計なフィールドは不可
- 設定: layout / theme / wp / stamp の4つだけ。スタンプ累計: 0 以上の整数

## ローカルで動かす

```bash
npm install
```

```bash
npm run dev
```

http://localhost:5173/ で開きます(ローカルモード)。本番の Firebase につないで試すときは `npm run dev:cloud`(Google ログインは本番のアカウントに書き込みます)。

## テスト

```bash
npm test
```

単体テスト(Vitest): 期限表示、並び順、スタンプ累計、LocalStore の CRUD、設定保存、入力チェック、音声の期限読み取り、メモのリンク化。

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

E2E(Playwright / ローカルモード): 追加→チェック→スタンプ→取消→編集→削除→元に戻す→リロード、メモ、テーマ等の切替と保存、写真壁紙、音声入力(SpeechRecognition はモック)、375px で横スクロールなし、900px でPC/スマホ切替、Service Worker でのオフライン起動。

```bash
npm run test:emu
```

Firebase Emulator(`demo-someday`。本番にはつながない)で、ルールのテスト(許可外メール・メール未確認の拒否を含む)と、ログイン画面(未ログイン / 許可アカウント / 許可外アカウント)、2つのブラウザ間のリアルタイム同期・他 uid の分離・オフライン→復帰・ログイン時の取り込みを確認します。Java が必要です。Windows では先に JAVA_HOME を設定してください(Git Bash の例):

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
```

スクリーンショットの撮り直し(`npm run dev` を 5178 番で起動しておく):

```bash
npx vite --port 5178
```

```bash
npm run screenshots
```

## デプロイ(GitHub Pages)

- ビルドの既定の base は `/someday-list/`(変えるときは `BASE_PATH=/xxx/ npm run build`)
- `.github/workflows/deploy.yml` が main への push でテスト→ビルド→Pages へ公開します
- 初回だけ GitHub のリポジトリで Settings → Pages → Source を「GitHub Actions」にしてください

## ファイル構成

```text
src/
  main.ts            画面の組み立て・イベント・設定パネル・編集シート
  styles.css         モックから移植したスタイル
  firebase-config.ts VITE_FIREBASE_* を読む(未設定ならローカルモード)
  core/              純粋関数(themes / logic: 期限・並び順・スタンプ・入力チェック / spoken: 音声の期限読み取り)
  store/             ストレージ層(types: 共通インターフェース / local: LocalStore / firestore: FirestoreStore / cloud: 初期化とログイン)
  ui/                icons / photo(IndexedDB) / voice(Web Speech API)
public/icons/        PWA アイコン(scripts/make-icons.mjs で生成)
tests/unit/          Vitest
tests/rules/         firestore.rules のテスト(Emulator)
e2e/                 Playwright(local.spec.ts / emulator.spec.ts)
firestore.rules, firebase.json, .firebaserc, firestore.indexes.json
```
