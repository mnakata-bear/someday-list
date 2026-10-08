# いつかやること 朝の通知(Windows)

毎朝10時(JST)に、未完了の「いつかやること」を、**画面の中央**(メインモニターの作業領域の中央)に小さなウィンドウで出します。
アプリ本体(Vite)とは独立しており、GitHub Pages の deploy には含まれません。

見た目は「ふきだし」案(`mock-dialog-cute.html` の2)。背景は透明で、ペンギンの丸アイコンが吹き出しでしゃべり(「おはよう！いつかやること、のこり N件だよ」。昼以降は「こんにちは！」。期限切れがあれば「期限切れが M件あるよ」、0件なら「ぜんぶ終わってるよ！」)、その下の大きな吹き出しに一覧が並びます。
鍵がないときなどのエラーも、ペンギンが吹き出しで話します(置き場所のパスは選択・コピーできます)。

- 一覧は 期限切れ(赤) → 今日まで → 期限が近い順 → 期限なし の順で最大5件。超えた分は最下行に「ほか N件」。
- 行ごとにラベルのはんこ(仕事=紫、プライベート=ピンク)、メモがあるタスクは小さな印。
- ボタンは「閉じる」と「アプリを開く」。Esc でも閉じます。ドラッグで移動できます。
- 最前面になるのは表示後の約5秒だけ。文字は選択・コピーできます。

## 準備
1. このフォルダで `npm install`(Node.js 22 で確認)。
2. 鍵(サービスアカウント)を作る。Firebase コンソール → プロジェクト `itupo-app` → 歯車「プロジェクトの設定」→「サービス アカウント」→「新しい秘密鍵を生成」。
3. ダウンロードした JSON を、次の場所に `key.json` として置く。
   `C:\Users\work\.someday-notify\key.json`
   別の場所に置くなら、環境変数 `SOMEDAY_KEY` にそのパスを入れる。
   鍵はリポジトリに入れない(`.gitignore` 済み)。読み取り専用(`spaces/home/tasks` の取得のみ)で使います。

## 使い方
| やりたいこと | コマンド |
|---|---|
| 今すぐ表示(本番データ) | `run.cmd` または `node index.mjs` |
| 見た目の確認(鍵・Firebase なし、ダミー12件) | `run.cmd --demo` |
| 0件の日は何も出さない | `run.cmd --quiet-if-empty`(既定は「ぜんぶ終わっています」を表示) |
| 表示内容だけ JSON で見る | `node index.mjs --demo --print` |

## 毎朝の自動実行(タスクスケジューラ)
鍵を置いて `run.cmd` で表示できるのを確かめてから、PowerShell で:
```powershell
.\install-task.ps1              # 毎日10:00に登録
.\install-task.ps1 -Time 09:30  # 時刻を変える(再実行で置き換え)
.\install-task.ps1 -QuietIfEmpty
.\install-task.ps1 -WhatIf      # 登録せず内容だけ表示
.\uninstall-task.ps1            # 解除
```
- ログオン中のユーザーで対話的に実行します(黒い窓は出ません)。
- 10:00 にパソコンが off/スリープだった場合は、起動後に1回実行します(StartWhenAvailable)。
- 今すぐタスク経由で試す: `Start-ScheduledTask -TaskName SomedayListNotify`

## テスト
- 単体テスト: `npm test`(並べ替え・期限表示・件数上限・JST日付)
- エミュレータでの取得確認(リポジトリ直下で。本番には接続しません):
  `firebase emulators:exec --only firestore --project demo-someday "node notify/test/emulator-check.mjs"`
  (Java が必要。Android Studio 同梱の JBR を `JAVA_HOME` と `PATH` に通す)

## トラブルシュート
- 「鍵ファイルが見つかりません」: 上の場所に `key.json` があるか、`SOMEDAY_KEY` のパスを確認。
- 「読み取りに失敗しました」: ネットワーク、鍵の権限(Cloud Datastore ユーザー相当)、鍵が失効していないかを確認。
- 表示されない: `node index.mjs --demo` で出るか確認。タスクの場合は `Get-ScheduledTaskInfo -TaskName SomedayListNotify` で LastTaskResult を見る。
- `node` が見つからない(タスク実行時): ユーザーの PATH に Node.js があるか確認。
- 日本語が化ける: `.ps1` は UTF-8 BOM 付きで保存してください(PowerShell 5.1 の仕様)。
