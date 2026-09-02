# 英語耳 母音トレーナー

『英語耳』の母音練習を「知識」から「無意識に出せる状態」へ移すための、個人用の静的 PWA です。
大量反復・聞き分け・自分の録音と見本の比較・忘却曲線に基づく復習を、スマートフォンから毎日すぐ行えるようにしています。

- HTML / CSS / JavaScript（ES Modules）のみ。ビルド不要、有料 API・API キー不使用
- GitHub Pages / Cloudflare Pages でそのまま公開可能
- Service Worker によりインストール後はオフラインで動作
- 学習データは IndexedDB（使えない環境では localStorage）に保存、JSON でバックアップ／復元
- iPhone 縦画面を最優先、PC にも対応。UI は日本語
- **自動発音判定は行いません。** 波形・音声合成・音声認識から発音の点数を作ることはせず、評価はすべて自己評価です

---

## 1. すぐ試す

```bash
cd eigomimi-app
python3 -m http.server 8123      # または npx serve .
# ブラウザで http://localhost:8123/ を開く
```

`file://` では ES Modules と Service Worker が動かないため、必ず HTTP サーバー経由で開いてください。
録音（マイク）は `localhost` か HTTPS でのみ使えます。

---

## 2. ファイル構成

```
eigomimi-app/
├─ index.html                 エントリー
├─ manifest.webmanifest       PWA マニフェスト
├─ sw.js                      Service Worker（本体はプリキャッシュ、音声は再生時キャッシュ）
├─ css/style.css
├─ js/
│  ├─ app.js                  起点・ハッシュルーティング・共通レイアウト
│  ├─ db.js                   IndexedDB ラッパー、エクスポート／インポート、容量エラー処理
│  ├─ srs.js                  復習間隔・今日の計画・集計（純粋関数、テスト対象）
│  ├─ store.js                保存・集計のドメイン層
│  ├─ audio.js                Web Audio 再生（速度変更・区間リピート）、MediaRecorder 録音、波形、合成音声
│  ├─ components.js           見本トラックプレイヤー、録音ビュー
│  ├─ practice.js             1回の練習フロー（10 ステップ）
│  ├─ sortgame.js             単語分類ゲーム（3列／2列）
│  ├─ quiz.js                 聞き分けクイズ（2択／3択）
│  ├─ dashboard.js            ホーム／ダッシュボード
│  ├─ records.js              録音の一覧・比較・削除
│  ├─ settings.js             設定・音声取り込み・バックアップ・ストレージ
│  ├─ curriculum.js           課程一覧
│  └─ util.js
├─ data/
│  ├─ curriculum.json         カリキュラム（編集可）
│  ├─ words.json              単語・発音記号・注記・minimal pairs（編集可）
│  └─ sample-data.json        サンプル学習履歴（設定画面から読み込み）
├─ audio/                     見本音声 {話者}-Practice-{Track}.mp3（下記参照）
├─ icons/
├─ tests/                     node --test 用のユニットテスト、Playwright e2e
├─ .github/workflows/pages.yml  GitHub Pages 自動デプロイ
└─ README.md
```

---

## 3. 見本音声の扱い（重要）

アプリは `audio/M-Practice-26.mp3` のように **`{話者}-Practice-{2桁Track}.mp3`** という名前のファイルを探します。
話者 ID は `data/curriculum.json` の `speakers`（初期値 `M`＝男性、`F`＝女性）です。

母音セクションで使うのは Track 26〜38 です。手元の `Eigomimi` フォルダの該当ファイルを `audio/` に置けば、そのまま 2 話者の見本として使えます（このリポジトリを作成した時点でコピー済みです）。

書籍付属の音声は著作物なので、**公開リポジトリには含めないでください。** `.gitignore` で `audio/*.mp3` を除外しています。公開サイトで音声を使う方法は 2 つあります。

1. **アプリ内に取り込む（推奨）**
   設定 →「音声の取り込み」→ トラックファイルを選択（iPhone なら「ファイル」アプリ経由）。
   ファイルは端末の IndexedDB に保存され、オフラインでも再生できます。サーバーには一切送られません。
2. **非公開の配信先に置く**
   Cloudflare Pages の Access 制限や、自分だけが知る URL などに `audio/` を含めて配置する。

音声が 1 つも無くても、単語リスト・録音・反復カウンター・聞き分け（合成音声）・復習管理はすべて使えます。
見本トラックが無い項目ではプレイヤーに「音声未登録」と表示されます。

### 単語音声について

聞き分けクイズと分類ゲームの単語音声は、次の優先順で再生します。

1. 設定で登録した単語音声（`単語 × 話者` で複数登録可。複数話者を登録すると出題ごとにランダム）
2. 端末の音声合成（`speechSynthesis`、en-US）。参考用のフォールバックで、画面に「合成音声」と表示されます

---

## 4. 使い方（1 回の練習）

ホーム「今日の練習」から項目を開くと、10 ステップを順に進めます。

1. 今日の音と口の使い方
2. 見本音声を再生
3. 0.75 倍・1 倍・A-B 区間リピート（0.75 倍は音程を保持。非対応端末では音程が下がります）
4. 練習単語（タップで音声、録音・反復の対象になる）
5. 録音（画面下の「録音」で開始／停止。停止すると自動で +1 反復）
6. 見本 → 自録音の交互再生、過去の録音との比較
7. 反復カウンター（+1／やり直し／目標回数。10 回ごとに休憩を促す）
8. 聞き分けクイズ（最初の回答のみ正答率に使用。混同ペアを記録）
9. 自己評価（× △ ○ ◎ 未）、苦手単語、メモ
10. 今日の結果を保存 → 次回復習日を表示

画面下部の **再生 / 録音 / もう一回** は全ステップ共通で、親指で押せる大きさに固定しています。
PC では `P`＝再生、`R`＝録音、`Space`＝+1 のキーボード操作ができます。

### 評価と復習間隔

| 評価 | 意味 | 次回 |
|---|---|---|
| × | 音を形成できない／ほとんど聞き分けられない | 翌日（段階リセット） |
| △ | 見本直後ならできるが自力では不安定 | 2 日後（段階は進めない） |
| ○ | 少し迷うが自力で概ね再現・識別できる | 1 → 2 → 4 → 7 → 14 → 30 → 60 日 |
| ◎ | 考えずに安定して再現、聞き分けもほぼ間違えない | 段階を 2 つ進める |
| 未 | 実施しなかった | 翌日へ持ち越し（失敗扱いしない） |

聞き分け 10 問中 7〜8 問で ○、9〜10 問で ◎ を目安として画面に表示しますが、決定は自己評価です。
2 日構成の項目は、1 日目の評価が △ 以上なら翌日に 2 日目、× なら 1 日目をやり直します。2 日目終了後に復習段階へ入ります。
新規は 1 日 1 項目まで。期限の来た復習はすべて表示し、「新規を明日へ延期」ボタンで新規を先送りできます。

---

## 5. データ編集

### `data/curriculum.json`

項目の順序は `order` で固定です。各項目は `sounds`（対象音）、`tracks`（Track 番号）、`dayCount`、`days[]`（`goal`、`mouth`＝口・舌・顎の説明、`words`＝練習単語、`sentences`）を持ちます。
`days[].words` の単語は `words.json` に同じ `item` で定義されている必要があります（テストで検証）。

### `data/words.json`

`words[]`: `{ item, word, sound, ipa, note? }`。`sound` は原則その項目の `sounds` のいずれか。対比用に項目外の音を入れる場合は `note` を必須にしています。`note` には方言差（cot–caught merger、pin–pen merger など）や綴り例外を書きます。
`pairs[]`: 聞き分けクイズの minimal pair（2〜3 語、音が互いに異なること）。

編集後は `npm test` で整合性を確認してください。Service Worker は network-first なので、公開後の JSON 変更は次回オンライン起動時に反映されます。

---

## 6. 保存されるデータ

IndexedDB `eigomimi` に以下のストアがあります。

| ストア | 内容 |
|---|---|
| progress | 項目ごと：対象音・Track・学習段階（0〜6）・状態（new/learning/review）・1日目/2日目・最終実施日・次回復習日・評価履歴・累計反復・メモ |
| sessions | 1 回の練習：日付・項目・日・新規/復習・反復数・やり直し数・聞き分け正答数・自己評価・苦手単語・録音 ID・メモ・所要時間 |
| repCounts | 日 × 音 の反復数 |
| wordReps | 単語ごとの累計反復数 |
| quizLog | 聞き分け 1 問ごとの記録（聞いた音・選んだ音・正誤・最初の回答か） |
| weakWords | 苦手単語（誤答回数、翌日再出題の期限） |
| recordings | 録音 Blob とメタ（単語・日付・自己評価「近い／不安定／違う」・サイズ） |
| wordAudio / trackAudio | 取り込んだ音声ファイル |
| settings | 設定 |

### バックアップ／復元

設定 →「学習データを書き出し」で JSON をダウンロードします。「録音も含めて書き出し」は Blob を Base64 で埋め込みます（サイズ約 1.35 倍）。
復元は「追加・上書き」または「置き換え」を選べます。形式が違う JSON、壊れた JSON、未対応の `schema` はエラー表示で拒否され、既存データは変更されません。

---

## 7. スマートフォンでのマイク権限と音声保存

- **HTTPS 必須**：マイクは HTTPS（または localhost）でしか使えません。GitHub Pages / Cloudflare Pages は HTTPS です。
- **iPhone**：Safari で開き、初回の録音時に「マイクへのアクセスを許可」を選びます。拒否した場合は 設定 → Safari → マイク、またはページの「ぁあ」メニュー → Web サイトの設定 から変更できます。ホーム画面に追加した PWA でも録音できます（iOS 14.3 以降）。録音形式は `audio/mp4`（AAC）になります。
- **Android / Chrome**：初回にマイク許可のダイアログが出ます。形式は `audio/webm;codecs=opus`。
- **保存先**：録音は端末内の IndexedDB にのみ保存され、どこにも送信されません。iOS の Safari は **7 日間サイトを開かないとサイトデータを削除する** ことがあります。ホーム画面に追加して使う、設定の「永続化を要求」を押す、定期的に JSON バックアップを取る、の 3 点を推奨します。
- **容量**：設定で録音の保持上限（初期値 60 件）を決められ、超えた古い録音は自動削除されます。「録音」タブから個別／一括削除もできます。容量不足（`QuotaExceededError`）のときは録音は保存されずエラーを表示し、反復回数だけが記録されます。
- **他アプリの音**：録音中は端末の他の音声再生が止まることがあります。

---

## 8. GitHub Pages への公開手順

1. GitHub で新しいリポジトリを作成（例 `eigomimi-app`）。
2. このフォルダをプッシュします。

   ```bash
   cd eigomimi-app
   git init
   git add .
   git commit -m "Eigomimi vowel trainer"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/eigomimi-app.git
   git push -u origin main
   ```

   `audio/*.mp3` は `.gitignore` により含まれません（書籍音声を公開しないため）。
3. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
   同梱の `.github/workflows/pages.yml` が `main` への push ごとにデプロイします。
   （Actions を使わない場合は Source を「Deploy from a branch」→ `main` / `/ (root)` にしても動きます。）
4. 数分後、`https://<ユーザー名>.github.io/eigomimi-app/` で開けます。すべてのパスは相対なのでサブパスでも動作します。
5. iPhone の Safari で開き、共有 →「ホーム画面に追加」。次に 設定 →「音声の取り込み」で Track 26〜38 の MP3 を取り込みます（一度取り込めばオフラインでも使えます）。

### Cloudflare Pages の場合

Cloudflare ダッシュボード → Workers & Pages → Create → Pages → Connect to Git → リポジトリを選択。
Build command は空、Build output directory は `/`（ルート）。以上で公開されます。

### 更新の反映

`sw.js` の `VERSION` を変えると古いキャッシュが破棄されます。アプリ本体は network-first なので通常は次回オンライン起動で最新になり、「新しいバージョンがあります」と表示されたら再読み込みしてください。

---

## 9. テスト

```bash
npm test                # ユニットテスト（復習間隔、計画、集計、データ整合性、DB フォールバック／エクスポート／インポート）
npm run test:e2e        # Playwright による画面遷移テスト（別ターミナルで npm start しておく）
```

e2e はスマホ幅（390×844）と PC 幅（1280×800）で、練習 10 ステップ・録音・休憩ダイアログ・クイズ・保存・分類ゲーム・録音一覧・サンプル読み込み・不正 JSON の復元拒否・音声未登録表示・マイク拒否・容量不足・オフライン起動を確認し、スクリーンショットを `/tmp/shots/` に保存します。`npx playwright install chromium` が必要です。

---

## 10. 変更しやすい初期値

| 場所 | 内容 | 初期値 |
|---|---|---|
| 設定画面 | 1 語の目標回数 | 10 |
| 設定画面 | 休憩を促す間隔 | 10 回 |
| 設定画面 | 聞き分け出題数 | 10 |
| 設定画面 | 録音保持上限 | 60 件 |
| `js/srs.js` `INTERVALS` | 復習間隔 | 1,2,4,7,14,30,60 |
| `js/srs.js` `applyRating` | × の扱い | 段階を 0 に戻し翌日 |
| `js/srs.js` `suggestRating` | 評価目安のしきい値 | 90% ◎ / 70% ○ / 50% △ |
| `js/sortgame.js` `count` | 分類ゲームの出題数 | 15 語 + 苦手語 |
| `data/curriculum.json` `speakers` | 話者 ID とラベル | M / F |
| `sw.js` | 先読みする Track 範囲 | 26〜38 |

---

## 11. 既知の制約

- 0.75 倍再生の音程保持は `preservesPitch` 対応ブラウザ（Safari 15+、Chrome、Firefox）で有効です。
- iOS Safari で録音した `audio/mp4` の波形描画は `decodeAudioData` の対応状況に依存し、描けない場合は「波形を表示できません」と表示します（再生は可能）。
- 合成音声（TTS）の品質・有無は端末依存です。見本は必ず Track 音声を優先してください。
- 認識系 API（SpeechRecognition）は使用していません。認識結果を発音精度として表示することはありません。
