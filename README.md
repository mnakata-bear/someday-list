# いつかやることリスト(PWA)

期限はあってもなくてもいい「いつかやりたいこと」を書きためるリストです。
スマホとパソコンで同期でき(Firebase)、ホーム画面に追加してアプリのように使えます(PWA)。

- 公開: https://mnakata-bear.github.io/someday-list/ (入口ページ。合言葉を入れるとアプリがひらく)
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
| やること・スタンプ累計 | Firestore 共有スペース `spaces/home/tasks/{taskId}`、`spaces/home/meta/stats` | この端末の localStorage |
| 設定(テーマなど) | Firestore `spaces/home/meta/settings`(端末にも控え) | この端末の localStorage |
| 自分の写真(壁紙) | **この端末の IndexedDB だけ**(クラウドには上げない) | 同じ |

許可された 2 アカウントは **同じ 1 つのリスト(共有スペース `spaces/home`)** を使います。どちらでログインしても、同じタスク・スタンプ累計・見た目設定になります。もう一方のアカウントからの変更も「別の端末から〜」のトーストで知らせます。

#### 以前のデータ(`users/{uid}/...`)からの移行

以前は 1 アカウント 1 リスト(`users/{uid}/...`)でした。ログイン時(アプリを開いてログイン状態が確定したとき)に旧データがあれば、自動で共有スペースへ移します(`src/store/migrate.ts`、計画は `src/core/migration.ts`)。

- タスク: 共有スペースに無い ID だけ追加(同じ ID が共有側にあれば、共有側を残して上書きしない)
- スタンプ累計: 旧と共有の大きいほう / 設定: 共有側に無いときだけコピー
- コピーと旧データの削除は同じバッチで行い、移したあとは旧データを消すので一度だけ動きます。サーバーから読めないとき(オフライン)はスキップし、次に開いたときにやり直します
- **本番での移行・共有の動作は未検証です**(Emulator のテストでのみ確認)

### 音声入力について

Web Speech API を使います。**Chrome などでは、話した音声は Google のサーバーで文字に変換されます。**
対応していないブラウザではマイクボタンは表示されません(キーボードのマイク入力を使ってください)。

## モード

- **クラウドモード**: `VITE_FIREBASE_*` が設定されているビルド(本番)。**許可された Google アカウント(`naka.mutora3@gmail.com`、`naka.mutora7@gmail.com`)でログインするまで、ログイン画面だけを表示**し、一覧・追加フォーム・設定などは描画しません。
  - 許可外のアカウントでログインすると、すぐログアウトして「このアカウントでは使えません」と表示します
  - 「未ログイン(この端末のみ)」で使うモードはありません
  - 許可リストは `src/core/access.ts`(見た目用)と `firestore.rules` の `allowedEmail()`(守りの本体)。増やすときは両方を直す
  - 検索エンジン避けに `noindex, nofollow` の meta と `public/robots.txt` を入れています
  本番の設定は `.env.production` に入っています(Web の config は公開前提の値)。GitHub Actions のビルドはリポジトリの Variables から受け取ります。
- **ローカルモード(同期オフ)**: `VITE_FIREBASE_*` が無いとき。localStorage だけで動き、ヘッダーに「ローカルモード(同期オフ)」と出ます。
  `npm run dev` とテスト用ビルドはこちらです。

## 入口ページ(合言葉)

公開 URL のルートは「入口ページ(表紙)」です。「はじめる」→ 合言葉を入れると、アプリ本体へ移動します。

- アプリ本体の置き場所は合言葉から決まります: `slug = SHA-256("someday-list:" + 合言葉)` の16進の先頭24文字、置き場所は `/someday-list/app-<slug>/`
  - 入口ページは入力された合言葉から同じ計算(Web Crypto)をして、`app-<slug>/` があれば(HEAD が 200)移動、無ければ(404)「合言葉が違います」
  - 合言葉も slug も、リポジトリには入れていません。GitHub Actions が secret `APP_PASSPHRASE` から計算します(ログでは伏せ字)
  - 合言葉の前後の空白は無視します。大文字・小文字は区別します
- 一度通った端末は slug を localStorage に覚え、次からは聞かずにアプリへ移動します。合言葉が変わって 404 になったら、記憶を消して入口に戻ります
  - 記憶を消すには、アプリの設定(歯車)→「この端末の合言葉の記憶を消す」
- ホーム画面に追加(PWA)はアプリ側で行います。manifest の `scope` / `start_url` は `app-<slug>/` なので、ホーム画面からは入口を通らずにひらきます
- 以前ルート(`/someday-list/`)に登録されていたアプリの Service Worker は、入口に置いた同じ名前の `sw.js`(自己解除版)と入口ページ自身が解除します
- **これは「URL を知らない人を入れない」ための軽い仕組みです。** データを守っているのは、これまでどおり Google ログインの壁と Firestore のルールです

### 合言葉の変え方

GitHub の Settings → Secrets and variables → Actions → Secrets の `APP_PASSPHRASE` を更新して、Actions の「Deploy to GitHub Pages」を再実行(Run workflow)します。

- アプリの URL(slug)も変わります。ホーム画面に追加していた場合は、入口から入り直して追加し直してください
- 覚えていた端末は、次に入口を開いたときに古い slug が 404 になり、合言葉を聞き直します

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

- 許可リストのメール(`email_verified == true`)でログインしていれば、どちらのアカウントでも共有スペース `spaces/home/...` を読み書きできる(uid は問わない)
- 旧データ `users/{userId}/...` は移行用に、本人(uid 一致)かつ許可メールの **read と delete だけ**。書き込みは不可
- それ以外はすべて拒否
- タスク: `title` は 1〜100 字の文字列、`due` は `""` か `YYYY-MM-DD`、`note` は 2000 字以内の文字列、`done` は bool、日時は整数(ms)、余計なフィールドは不可
- 設定: layout / theme / wp / stamp の4つだけ。スタンプ累計: 0 以上の整数

## ローカルで動かす

```bash
npm install
```

```bash
npm run dev
```

http://localhost:5173/ で開きます(ローカルモード。入口ページなしでアプリだけが動きます)。

入口ページだけを見るとき(http://localhost:5174/someday-list/ 。アプリは無いので、どの合言葉も「違います」になります):

```bash
npm run dev:gate
```

本番と同じ形(入口+アプリ)を手元で組み立てるときは、環境変数 `APP_PASSPHRASE`(試し用の値)を付けて `npm run build:pages` を実行します(`OUT_DIR` で出力先、`APP_MODE=e2e` でローカルモードのアプリ)。本番の Firebase につないで試すときは `npm run dev:cloud`(Google ログインは本番のアカウントに書き込みます)。

## テスト

```bash
npm test
```

単体テスト(Vitest): 期限表示、並び順、スタンプ累計、LocalStore の CRUD、設定保存、入力チェック、音声の期限読み取り、メモのリンク化、旧データ移行の計画(重複 ID・累計・設定)。

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

E2E(Playwright / ローカルモード): `test:e2e` はアプリの E2E と入口ページの E2E(`playwright.gate.config.ts`)の両方を動かします。入口ページの E2E は、テスト用のダミー合言葉で入口+アプリを組み立てて、GitHub Pages に近い静的サーバー(`scripts/serve-pages.mjs`)で確認します(正しい合言葉→アプリ、間違い→エラー、2回目は自動でアプリへ、覚えた slug が 404 なら入口へ、旧 SW の解除、375px)。

アプリの E2E: 追加→チェック→スタンプ→取消→編集→削除→元に戻す→リロード、メモ、テーマ等の切替と保存、写真壁紙、音声入力(SpeechRecognition はモック)、375px で横スクロールなし、900px でPC/スマホ切替、Service Worker でのオフライン起動。

```bash
npm run test:emu
```

Firebase Emulator(`demo-someday`。本番にはつながない)で、ルールのテスト(2 アカウントが同じ `spaces/home` を読み書きできる、許可外メール・メール未確認・未ログインの拒否、旧 `users` は本人の read/delete のみで write 拒否)と、ログイン画面(未ログイン / 許可アカウント / 許可外アカウント)、別々の許可アカウントでログインした 2 つのブラウザ間のリアルタイム同期(同じリストの共有)・旧データ `users/{uid}` から共有スペースへの移行(共有側が空 / すでにある場合)・オフライン→復帰・ログイン時の取り込みを確認します。Java が必要です。Windows では先に JAVA_HOME を設定してください(Git Bash の例):

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
- `.github/workflows/deploy.yml` が main への push でテスト→ secret `APP_PASSPHRASE` から slug を計算→ `scripts/build-pages.mjs` で入口(`dist/`)とアプリ(`dist/app-<slug>/`)をビルド→ Pages へ公開します
- secret `APP_PASSPHRASE` が無いとビルドは失敗します
- 初回だけ GitHub のリポジトリで Settings → Pages → Source を「GitHub Actions」にしてください

## ファイル構成

```text
entrance/            入口ページ(表紙+合言葉。index.html / main.ts / style.css、public/sw.js は旧 SW の自己解除版)
src/
  main.ts            画面の組み立て・イベント・設定パネル・編集シート
  styles.css         モックから移植したスタイル
  firebase-config.ts VITE_FIREBASE_* を読む(未設定ならローカルモード)
  core/              純粋関数(themes / logic: 期限・並び順・スタンプ・入力チェック / spoken: 音声の期限読み取り / gate-slug: 合言葉→slug / migration: 移行の計画)
  store/             ストレージ層(types: 共通インターフェース / local: LocalStore / firestore: FirestoreStore(共有スペース) / migrate: 旧データの移行 / cloud: 初期化とログイン)
  ui/                icons / photo(IndexedDB) / voice(Web Speech API)
scripts/             slug.mjs(合言葉→slug の Node 版) / build-pages.mjs(入口+アプリをまとめてビルド) / serve-pages.mjs(E2E 用の静的サーバー)
public/icons/        PWA アイコン(scripts/make-icons.mjs で生成)
tests/unit/          Vitest
tests/rules/         firestore.rules のテスト(Emulator)
e2e/                 Playwright(local.spec.ts / emulator.spec.ts / gate.spec.ts)
firestore.rules, firebase.json, .firebaserc, firestore.indexes.json
```
