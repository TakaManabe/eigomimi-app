# 母音ドリル（英語耳）

単語を見て、どの母音かを即答する大量ドリルアプリです。1,546 語をフォニックスの順（閉音節 → マジック e → 母音チーム → r 性母音 → 二重母音）に並べた **26 ステップのコース**と、『英語耳』の母音カリキュラム（/ɑ æ ʌ/ = body / bat / but など）に沿った 10 セットを収録しています。
すべての語の母音は **CMU Pronouncing Dictionary と機械照合済み**です。
ビルド不要の静的 PWA（HTML + JS 1 ファイル + 単語 JSON）。GitHub Pages で公開でき、ホーム画面に追加すればオフラインでも使えます。

公開ページ: https://takamanabe.github.io/eigomimi-app/

## 使い方

1. ホームでコースのステップ（または従来のセット）を選び「始める」。出題数は 20 / 50 / 100 / 無制限
2. 単語が出たら母音ボタンをタップ（PC は数字キー 1〜3）。制限時間は初期設定 3 秒（なし / 2 / 3 / 5 秒）。時間内に答えないと時間切れとして不正解扱い
3. 正解なら緑になり 0.5 秒で次へ。不正解なら正解を表示し、1.5 秒で自動的に次へ（初期設定。「次へ」／Space で先に進むことも可）。ドリル開始画面で「『次へ』を押す」に切り替えられる
4. 回答後は、その母音に当たる綴りが **赤字・下線** で表示される（b**a**t、st**o**mach、th**ough**t）。声に出してから次へ
5. 終了時に正答率・音別成績・「綴り → 音」の混同・間違えた語（タップで音声）を表示。「苦手だけ」で誤答語だけを回せる

### フォニックス・コース（26 ステップ）

音節タイプの順に進みます。並びは Reading Universe / Five from Five の scope & sequence と、Hanna(1967)/Fry(2004) の綴り頻度（閉音節の一字母音は 86〜97% 安定）にもとづきます。

| | 内容 | 語数 |
|---|---|---|
| P1 | 閉音節の短母音（a i o u e） | 618 |
| P2 | マジック e と開音節 | 272 |
| P3 | 母音チーム（ee ea ai ay oa ow igh ew …） | 265 |
| P4 | r 性母音（ar or er ir ur air are ear） | 184 |
| P5 | 二重母音とその他（ou ow oi oy oo au aw） | 207 |
| P6 | 一綴り多音の罠（同じ綴りで音が割れる語だけ） | — |
| P7 | 方言差と綴り例外（CLOTH 語ほか） | 129 |

- **合格判定**: 20 問以上を正答率 90% で 2 回連続すると合格
- **blocked → mixed**: 合格前はそのステップの語だけ、合格後は既習語が 30% 混ざる（累積復習）
- **選択肢**: 音が 6 つ以上になる総合ステップでは、毎問「正解 ＋ 紛らわしい 2 音」の 3 択を作る
- **復習キュー**: 間違えた語は翌日に戻り、正解するたび 1 → 3 → 7 → 14 → 30 日と間隔が伸びる。ホームの「今日の復習」から回せる

### 出題の仕組み

- 未出題の語と、過去に間違えた語を重み付きで優先。3 回以上出て無誤答の語は控えめに
- 各音から均等に出題（3 音なら 1/3 ずつ）
- 間違えた語は同じ回の 4〜7 問後にもう一度出る。次回以降も優先される
- 記録（単語ごとの出題・正解・誤答、回ごとの結果）は端末の localStorage のみ。サーバー送信なし
- ホームに今日の語数・正答率・連続日数・7 日間の推移・混同ペアを表示。JSON でバックアップ／復元（追加マージ）

音声は端末の音声合成（en-US）を回答後に鳴らすだけの参考用で、**自動の発音判定は行いません**。

## ファイル

```
index.html                画面（CSS 込み）
app.js                    すべてのロジック（ルーティング・出題・記録・バックアップ）
data/drill-words.json     単語バンク: course（26 ステップ）/ sets / words（word / sound / hl / g / st / note）
tests/build-drill-words.py  単語バンクの生成（単語リスト・強調範囲・ステージ判定・CMU 照合・コース定義）
tests/cmu-vowels.json     CMU 辞書から生成した強勢母音（照合結果。build スクリプトが書き出す）
tests/data.test.js        データ整合性テスト（node --test。CMU 照合とコースの検査を含む）
tests/e2e.mjs             Playwright での動作確認（スマホ幅・PC 幅・オフライン）
sw.js / manifest.webmanifest / icons/   PWA
.github/workflows/pages.yml  push で テスト → GitHub Pages デプロイ
```

### 単語の編集

`tests/build-drill-words.py` の `add('音', "単語 …", "注記")` を編集して `python3 tests/build-drill-words.py` を実行すると `data/drill-words.json` が再生成されます。
同じ語を複数の音に登録すると停止します（live, wind, bow, read のような二通りに読める語は入れない）。
ビルド時に **CMU Pronouncing Dictionary（`tests/cmudict.dict`。無ければ自動取得、gitignore 済み）と全語を照合**し、
主強勢の母音が一致しない語があると停止します。意図的に採用する語は理由つきで `DIALECT_OK`（方言差）/ `CMU_MISSING`（未収録）に、
除外する語は `EXCLUDE` に書きます。品詞で強勢が動く語（object, contract, conflict）や二通りに読める語（live, minute, dove）はここで除いています。
`hl`（赤字にする綴りの範囲）は音ごとの規則で自動推定し、強勢が後ろにある語（attack, adapt, eleven, believe …）は `OVERRIDE` で手動指定します。`npm test` が範囲の妥当性を検査します。
cot–caught merger の対象語（dog, off, cost など CLOTH 語）は /ɔː/ に置き、注記を付けています。

## 開発

```bash
python3 -m http.server 8123   # http://localhost:8123/  （file:// では動きません）
npm test                      # データ整合性
npm run test:e2e              # 別ターミナルでサーバーを起動した状態で
```

## 公開

`main` に push すると GitHub Actions がテストを実行し、GitHub Pages にデプロイします（Settings → Pages → Source: GitHub Actions）。
更新は `sw.js` の `VERSION` を変えると確実にキャッシュが入れ替わります。

以前のフル機能版（10 ステップの練習フロー・録音比較・復習間隔・聞き分けクイズ・分類ゲーム）は git 履歴のタグ `full-app` に残しています。
