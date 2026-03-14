# 作業履歴 — 川津小学校PTA Webサイト リプレイス

> 作成: 2026-03-10
> リポジトリ: `n-nishizaki/kawatsu-pta-web`
> 公開URL: `https://n-nishizaki.github.io/kawatsu-pta-web/`

---

## プロジェクト概要

| 項目 | 内容 |
|---|---|
| 現行サイト | http://kawatsupta.byonia.net/ （レンタルサーバー・HTML直編集） |
| 目標 | **0円運用** かつ **非技術者でも更新可能** |
| 採用アーキテクチャ | Google ドキュメント → GAS → GitHub API → GitHub Pages（Jekyll） |

---

## 作業セッション履歴

### セッション 1（2026-03-09 前半）— 基盤構築

#### 実施内容

**アーキテクチャ設計**
- Google ドキュメント → GAS → GitHub API → Jekyll/Markdown という構成に決定
- 当初は GAS が直接 HTML を生成する案もあったが、Google Docs のインラインスタイル混入問題を避けるため Markdown 経由に変更

**サイトテンプレート作成**（`e0d7b44` 初回公開）
- Jekyll ベースの静的サイト構成を構築
  - `_layouts/default.html` — 共通レイアウト（ヘッダー・ナビ・フッター）
  - `index.html` — ホーム（更新情報一覧 + 執行部挨拶）
  - `info.html` — 役立ち情報
  - `contact.html` — コンタクト（Google フォーム埋め込み）
  - `event.html` — お知らせ一覧（年別・月別グルーピング）
  - `css/style.css` — 現行サイトに準じたシンプルデザイン
- `_config.yml` に `baseurl: /kawatsu-pta-web` を設定

**旧アーキテクチャからの移行**（`2e60250`）
- 初期に試した `data/posts.json` + `posts/*.html` 方式を廃止
- Jekyll の `_posts/` Markdown 方式に一本化

**GAS スクリプト作成**（`gas/Code.gs`）
- Google ドキュメントに「PTA公開」カスタムメニューを追加
- `publishDocument()` — ドキュメントを Markdown に変換して `_posts/YYYY-MM-DD-*.md` として GitHub に push
- `publishDocumentMembersOnly()` — `members_only: true` フロントマターを付与して会員限定扱いにして公開
- Markdown 変換で対応する書式: 見出し・太字・斜体・箇条書き・リンク

**バグ修正・改善**
- `relative_url` フィルタ未使用による CSS/JS リンク切れを修正（`f84e267`）
- Google Drive URL を `uc?id=` 形式から `lh3.googleusercontent.com` 形式に統一（`b58254e`, `1905997`）
  理由: `uc?id=` は GitHub Pages からの参照でリダイレクトが発生し表示が不安定
- GAS にてテキスト変換を強化: 太字(`**`)・斜体(`*`)・文字色・フォントサイズを Markdown/HTML に変換する `convertTextToMarkdown()` を追加（`101c4b0`）
- Google フォームの iframe 埋め込みを `contact.html` に設置（`f84e267`）

---

### セッション 2（2026-03-09 後半）— スプレッドシート連携・各種修正

#### 実施内容

**スプレッドシート連携の実装**（`3b100cc`, `340fb65`）

ホームの「ご挨拶」・役立ち情報・リンク集を Google スプレッドシートから更新できる仕組みを構築。

スプレッドシート構成（ID: `14UI3jfK5OBSsoqm2xDgOWKReUNDUipVK_mlGJaiYBHc`）:

| シート名 | カラム構成 |
|---|---|
| ご挨拶 | A1: ラベル, B1: 本文テキスト |
| 役立ち情報 | A: タイトル（`【会員限定】`プレフィックスで会員限定フラグ）, B: 説明, C: URL |
| リンク集 | A: 名称, B: URL |

実装方式:
- `_data/greeting.json` — ご挨拶テキストを格納
- `_data/info.json` — 役立ち情報リンク・外部リンクを格納
- `index.html`, `info.html` を Liquid テンプレートに更新（`site.data.greeting`, `site.data.info` を参照）
- 「会員限定」バッジ（`.badge-members`）を Liquid 条件分岐で表示制御

**GAS をドキュメント用とスプレッドシート用に分離**（`4fdfae7`）

| ファイル | バインド先 | 主な機能 |
|---|---|---|
| `gas/Code.gs` | Google ドキュメント | `publishDocument()` — 記事を Markdown に変換して push |
| `gas/SpreadsheetCode.gs` | Google スプレッドシート | `publishSiteInfo()` — ご挨拶・役立ち情報・リンク集を JSON として push |

分離の背景: `DocumentApp.getUi()` は Google ドキュメントにのみメニューを追加できる。スプレッドシートのメニューには `SpreadsheetApp.getUi()` を使うスクリプトを別途バインドする必要がある。

**ご挨拶の改行対応**（`5715064`）
- スプレッドシートから取得したテキスト内の `\n` が HTML で無視される問題を修正
- `index.html` の Liquid テンプレートに `| newline_to_br` フィルターを追加

**ヒーロー画像の表示修正**（`5715064`）
- 現行サイト（http://kawatsupta.byonia.net/）に合わせ、画像を切り抜きなしで全体表示に変更

```css
/* 修正前 */
#hero { max-height: 280px; overflow: hidden; }
#hero img { height: 280px; object-fit: cover; }

/* 修正後 */
#hero { width: 100%; }
#hero img { width: 100%; height: auto; display: block; }
```

**キャッシュ問題の調査と修正**

*症状*: CSS の変更がブラウザに反映されない。`curl` では正しい内容が返るが、ブラウザでは古いファイルが表示される。

*調査結果*: `n-nishizaki.github.io` の個人ブログ（Chirpy テーマ）が PWA Service Worker をルートスコープ (`https://n-nishizaki.github.io/`) で登録しており、サブパス `kawatsu-pta-web/` 配下のリクエストもキャッシュファーストで返していた。

*修正*: `n-nishizaki.github.io/_config.yml` の `pwa.cache.deny_paths` に `/kawatsu-pta-web` を追加し、GitHub API 経由でコミット（commit: `273fec5`）。

```yaml
# n-nishizaki.github.io/_config.yml
pwa:
  cache:
    deny_paths:
      - "/kawatsu-pta-web"   # ← 追加
```

*ブラウザ側の対処*: 上記変更のデプロイ後、Chrome の DevTools → Application → Service Workers → Unregister で古い SW を手動削除する（または シークレットモードで確認）。

---

### セッション 3（2026-03-10）— 会員限定ページの実装

#### 実施内容

**会員限定ページの新規実装**（`578b92f`）

XOR + SHA-256 によるクライアントサイド復号方式で会員限定コンテンツを保護。

セキュリティ設計のポイント:
- パスワードを JavaScript ソースに書かない（復号キー = ユーザー入力パスワードの SHA-256）
- 復号後の JSON パース成否を認証チェックとして利用
- GAS の `MEMBER_PASSWORD` スクリプトプロパティにパスワードを安全に保管
- `data/members.json`（`_data/` ではなく `data/`）に暗号化データを格納（Jekyll が `_data/` を静的ファイルとして配信しないため）

追加ファイル:
- `members.html` — ログインフォーム + コンテンツエリア
- `js/members.js` — 復号・認証・コンテンツ描画ロジック
- `data/members.json` — GAS が push する暗号化済みデータ

GAS に追加した関数:
- `publishMembersInfo()` — スポ少情報・広報誌シートを読み取り、XOR 暗号化して push
- `encryptXOR(text, password)` — `Utilities.computeDigest(SHA_256)` を 32 バイトキーとして使用

**ページ URL 修正**（`6b5f94b`）

Jekyll は `members.html` から `members/index.html` を生成するため、URL は `/members.html` ではなく `/members/` が正しい。`_data/info.json` と `gas/SpreadsheetCode.gs` のフォールバック URL を修正。

**セクション別表示の実装**（`8e6f3dd`）

広報誌とスポ少情報を URL パラメータ（`?section=newsletter` / `?section=sports`）で切り替える方式を採用（ページを分けず単一ページ内でフィルタリング）。

- `js/members.js` に `getCurrentSection()` を追加
- DOMContentLoaded でページタイトルをセクション名に書き換え
- コンテンツ表示後にセクションに応じて不要な区画を非表示
- `_data/info.json` のリンク先を `/members/?section=newsletter` / `/members/?section=sports` に変更
- GAS の `publishSiteInfo()` が C 列の URL を読み取るよう更新（未入力の場合 `/members/` にフォールバック）

**セクションラベル重複の修正**（`87a33b5`）

`js/members.js` がページタイトル（`#page-title`）をセクション名で書き換えるため、コンテンツ内にも同名の `<div class="section-title">` があると 2 重表示になっていた。コンテンツ内の section-title div を削除して解消。

**ログイン情報の自動保存**（`5e609d3`）

毎回パスワードを入力する手間を解消するため `localStorage` による自動ログインを実装。

| 動作 | 内容 |
|---|---|
| 初回ログイン成功時 | パスワードを `localStorage` に保存 |
| 次回以降のアクセス | 保存済みパスワードで自動ログイン |
| パスワード変更後 | 復号失敗 → 保存済みを自動削除 → ログインフォームを表示 |
| ログアウトボタン | 保存情報を削除してログインフォームへ戻る（共用端末対策） |

**GAS スプレッドシートの運用上の注意点（判明した問題）**

- スプレッドシートの C 列 URL セルはリンク付きセルになっていると、`getValues()` が表示テキストではなく内部値を返す場合がある
- URL を更新する際は**セルを完全削除してから入力し直す**こと
- URL は `http://` を付けず `/kawatsu-pta-web/members/?section=...` のようにパス形式で入力する
- GAS スクリプトエディタのコードを `gas/SpreadsheetCode.gs` の最新版と同期させること（ローカルの `.gs` ファイルは参照用であり、実際の GAS とは別管理）

---

### セッション 4（2026-03-11）— ヘッダーデザイン改修・セキュリティ強化

#### 実施内容

**ヘッダーにカバー画像・Facebook アイコンを追加**（`9a27ba2`, `15b9320`, `d5eaf8d`）

- `_layouts/default.html` のヘッダーを `.header-left`（タイトル＋FB アイコン）と `.header-img`（カバー画像）の 2 カラム構成に変更
- Facebook アイコンを絵文字から実画像（Google Drive 経由）に差し替え
- カバー画像（あじさいの写真）をヘッダー右半分に配置
- ヘッダー高さを 70px に固定し、カバー画像を `object-fit: cover` で上下トリミング表示
- ヘッダー背景色を白に変更

```css
#header { height: 70px; background: white; display: flex; align-items: stretch; }
#header .header-left { flex: 1; padding: 12px 20px; }
#header .header-img { width: 50%; overflow: hidden; }
#header .header-img img { width: 100%; height: 100%; object-fit: cover; }
```

**会員ページにログイン試行回数制限（ロックアウト）を追加**（`a36f628`）

`localStorage` を使ったクライアントサイドのレート制限を実装。

| 動作 | 内容 |
|---|---|
| 1〜3 回失敗 | 「IDまたはパスワードが違います」 |
| 残り 1〜2 回 | 「あと N 回誤ると一時ロックされます」と警告 |
| 5 回失敗 | 5 分間ログイン試行をブロック、残り時間を表示 |
| 5 分後 | 自動解除 |
| ログイン成功 | 失敗カウントをリセット |

追加した localStorage キー: `members_fails` = `{ count: N, lockedAt: timestamp }`

セキュリティ上の注意: この制限はサイト上での試行のみに有効。`data/members.json` をダウンロードしてオフラインで試行する攻撃には無効（現実的な脅威ではないと判断）。

---

### セッション 5（2026-03-12）— GAS アーキテクチャ刷新・記事管理フロー完成

#### 実施内容

**GAS アドオン方式の検討と撤回**

複数の Google ドキュメントで 1 つのスクリプトを共有する方法として Google Workspace アドオンを検討・実装したが、OAuth 審査プロセスの問題と運用の複雑さから撤回。コンテナバインド型（各 Doc にスクリプトを紐づける方式）を継続採用し、以下の方針で課題を解決。

**`config.gs` による設定の一元管理**（`04bf834`）

スクリプトプロパティの問題（Doc コピー時にプロパティが引き継がれない）を `config.gs` ファイルで解決。

| 解決前 | 解決後 |
|---|---|
| スクリプトプロパティに Token 等を保存 → コピー時に失われる | `config.gs` にコード変数として記述 → コピー時に引き継がれる |

`gas/config.gs` の内容:
```javascript
var GITHUB_TOKEN  = '';  // GitHub Fine-grained Personal Access Token
var GITHUB_OWNER  = '';  // GitHub アカウント名
var GITHUB_REPO   = '';  // リポジトリ名
var GITHUB_BRANCH = 'main';
```
- リポジトリには空テンプレートとして含める（Token は各自の GAS エディタで入力）
- Doc コピー時に `config.gs` ごとコピーされるため次回以降の設定は不要

**記事 ID システムの導入・新規/更新/削除の完全実装**（`658c24d`）

ドキュメントヘッダーテーブルに ID フィールドを追加し、記事の一意識別と CRUD 操作を実現。

| ラベル | 仕様 |
|---|---|
| ID（自動入力） | `yyyyMMddHHmmss` 形式で GAS が自動採番。Doc に書き戻す。 |
| 公開日 | YYYY-MM-DD 形式。ファイル名にも使用。 |
| 更新日 | 記事修正時に任意入力。 |

新規公開フロー:
1. ID 欄が空欄 → 新規と判定
2. `yyyyMMddHHmmss` で採番 → Doc ヘッダーテーブルに書き戻す
3. `_posts/{公開日}-{ID}.md` として GitHub に push
4. 画像は `PTA-web-images/{ID}/` フォルダに保存

更新（上書き）フロー:
1. ID 欄が埋まっている → 更新と判定
2. `PTA-web-images/{ID}/` の旧画像を全削除 → 新画像を保存
3. GitHub 上の `_posts/` を ID で検索 → 旧ファイルを特定
4. 公開日が変わった場合: 旧ファイル削除 → 新ファイル名で作成
5. 公開日が変わらない場合: 同一ファイルを上書き

削除フロー（新機能）:
1. メニュー「この記事を削除する」を追加
2. 確認ダイアログを表示（誤削除防止）
3. GitHub 記事ファイルを削除 → Drive 画像フォルダをゴミ箱へ → Doc をゴミ箱へ

追加・変更した関数:

| 関数 | 内容 |
|---|---|
| `deleteArticle()` | 削除処理のエントリーポイント |
| `findGitHubFileById(id)` | `_posts/` を検索してIDを含むファイルを返す |
| `deleteFromGitHub(path, sha, msg)` | GitHub API DELETE でファイルを削除 |
| `clearDriveFolder(id)` | 画像フォルダ内のファイルをゴミ箱へ（フォルダは残す） |
| `deleteDriveFolder(id)` | 画像フォルダ自体をゴミ箱へ |

**要件定義書を更新**（`2a67908`）
- 4.1 記事投稿・更新・削除フローを新規/変更/削除の 3 区分で詳述
- 4.1.1 GAS スクリプト管理方針（`config.gs`）を追記

---

### セッション 6（2026-03-12）— 記事 ID を `doc.getId()` に変更

#### 背景・課題

前セッション（セッション 5）でページヘッダーに ID を書き込む方式を実装したが、
Google ドキュメントのページヘッダーはデフォルトの「ウェブレイアウト」表示では不可視のため
運用上問題があることが判明した。

#### 解決策

**記事 ID = `doc.getId()`（ドキュメント固有 ID）** に変更。

- URL の `d/` 以降の文字列をそのまま記事 ID として使用
- GAS が ID を Doc に書き戻す処理は一切不要になった
- ファイル名: `{公開日}-{doc.getId()}.md`（公開日はダイアログで入力）
- ドキュメントをコピーして流用した場合も `doc.getId()` が変わるので別記事として扱われる

#### 変更内容

**`gas/Code.gs` を全面改訂（セッション 6 全体の累積）**

| 変更 | 詳細 |
|---|---|
| `readDocHeader()` / `writeDocHeader()` を削除 | ヘッダー読み書きが不要になった |
| `更新日` を完全廃止 | フロントマター `updated:` も削除 |
| 公開日入力を HTML ダイアログ化 | `type="date"` フィールドに本日日付（または既存の公開日）を初期値セット。クライアントサイドで YYYY-MM-DD バリデーション。「次へ」で確認画面 → 「公開する」で実行。結果もダイアログ内に表示 |
| `createNewArticle()` を廃止 | メニューからも削除 |
| `deleteArticle()` でも `doc.getId()` を使用 | `findGitHubFileById()` で未公開チェック |
| `_publish()` を `publishDocument()` + `continuePublish()` に分割 | HTML ダイアログから `google.script.run` で呼び出す構造に |
| 公開完了メッセージからファイル名を非表示 | 担当者に不要な情報を隠す |
| `cleanupOrphanedArticles()` を追加 | GitHub `_posts/` の各 docId に対応する Doc が消えている（削除済み・ゴミ箱入り）場合に GitHub + Drive から削除。メニュー「孤立記事をクリーンアップ」から手動実行 |
| Docs 横並び画像を Web でも横並び表示 | 同一段落内の複数画像を `<div style="display:flex">` でラップ |
| `escapeHtml()` ヘルパー追加 | HTML ダイアログにタイトルを安全に埋め込むため |

#### PTA公開メニュー構成（最終）

```
PTA公開
  ├─ このドキュメントを公開する
  ├─ ─────────────────
  ├─ この記事を削除する
  ├─ ─────────────────
  └─ 孤立記事をクリーンアップ
```

#### メリット（まとめ）

- **ドキュメントに何も書かなくてよい** → 担当者の操作が最小限
- **公開日フィールドに本日日付が入力済み** → 通常はそのまま「次へ」で進める
- **正規削除フローを経ずに Doc を捨てても後から回収可能** → クリーンアップで対処
- **横並び画像が Web でも横並びで表示** → Docs と Web の見た目が一致

---

### セッション 7（2026-03-13）— 旧サイト記事マイグレーション

#### 実施内容

**マイグレーションツール作成（Step 1: `tools/migrate.py`）**

旧サイト（http://kawatsupta.byonia.net/report/）の全記事を Jekyll Markdown に変換して一括 push。

- `event.html` を起点に記事リンクを収集
- 各記事を BeautifulSoup でパース → フロントマター付き Markdown に変換
- `--dry-run` / `--from` / `--to` フィルターオプションあり
- 出力: `_posts/YYYY-MM-DD-migrated-YYYYMMDD.md`（`migrated: true` フラグ付き）
- GAS `cleanupOrphanedArticles()` が migrated- プレフィックスをスキップするよう修正

**マイグレーションツール作成（Step 2: `tools/migrate_images.py`）**

旧サーバーの画像を GitHub リポジトリに移動し、MD 内の URL を差し替える。

技術的なポイント:
- Pillow で画像圧縮（最大 1200px・JPEG 品質 80%）→ 旧サーバー画像合計 ~1.65GB → 圧縮後 ~138MB（容量問題を解消）
- 透過 PNG はそのまま保存、それ以外は JPEG 変換
- GitHub Contents API 経由で `assets/images/migrated/{YYYYMMDD}/` に push
- MD ファイルの旧サーバー URL を GitHub Pages URL に差し替えて再 push
- 503 レートリミット対策: ダウンロード間 1.5 秒スリープ + `[10, 30]` 秒リトライ
- 中断リトライ時の高速化: `get_saved_images()` で GitHub のフォルダ一覧を取得し、保存済み画像をスキップ
- 画像 push と MD 更新を 1 コミットに集約してデプロイ頻度を削減（`perf` コミット）

設定ファイル:
- `tools/config.py`（`.gitignore` 除外済み） — Token・リポジトリ名・`PAGES_BASE_URL` 等を記述
- `tools/config.py.example` — テンプレート

**写真グリッドを CSS columns レイアウトに変更**（`635e9ff`, `ebeb573`）

旧レイアウト（`display:flex` インラインスタイル）を廃止し、CSS columns 方式に統一。

| 画面幅 | 列数 |
|---|---|
| PC（> 768px） | 3列 |
| タブレット（≤ 768px） | 2列 |
| スマホ（≤ 480px） | 1列 |

- トリミングなし — 縦写真も自然にカラムに収まる
- 既存 93 記事を Python スクリプトで一括置換
- `tools/migrate.py` と `gas/Code.gs` も同じ出力形式に統一

**更新情報を3行固定・スクロール表示に変更**（`db6692a`）

- ホームの更新情報エリアを 3 行固定高さ + `overflow-y: auto` でスクロール対応

---

## 現在の git ログ（最新順・参考）

```
ebeb573 fix(gas): 複数画像の出力を photo-grid クラスに統一
635e9ff feat: 写真グリッドを CSS columns 3列レイアウトに変更
c403b2f perf(migrate): 画像+MD を1コミットに集約してデプロイ頻度を削減
db6692a feat: 更新情報を3行固定表示＋スクロール対応
（[migrate-img] コミット多数 — 旧サイト画像の GitHub 移行）
98975c5 GAS: 孤立記事クリーンアップ機能を追加
bdbf9bb GAS: 公開完了メッセージからファイル名を非表示
b9f4b9d GAS: Docs横並び画像をweb上でも横並びで表示
4d709c8 GAS: 公開日ダイアログを改善、新規テンプレート作成機能を廃止
09a8727 GAS: 記事IDをdoc.getId()に変更、公開日をダイアログ入力に変更
2b3950a GAS: 公開情報の保存先をページヘッダーに変更（後に廃止）
658c24d GAS: 新規/更新/削除の完全実装
04bf834 GAS 設定を config.gs に集約
2a67908 要件定義書を更新
a36f628 会員ページに5回失敗で5分ロックアウト機能を追加
d5eaf8d ヘッダーの高さを70pxに縮小
15b9320 ヘッダー画像を半幅・上下トリミング表示に変更、背景色を白に変更
9a27ba2 ヘッダーにカバー画像とFacebookアイコン画像を追加
6224bdb 会員ページの広報誌リンクを同一タブで開くよう変更
36653c5 会員ページのログインフォームフラッシュを防止
39e1ac0 HISTORY.md を更新（セッション3の作業内容を追記）
（GAS による定期更新コミット多数）
5e609d3 会員ページにログイン情報の自動保存を追加
87a33b5 会員ページのセクションタイトル重複を修正
8e6f3dd feat: 会員限定ページをセクション別に分離（?section=sports|newsletter）
6b5f94b fix: members リンクを /members.html から /members/ に修正
578b92f feat: 会員限定ページを実装（XOR暗号化 + クライアントサイド復号）
5715064 ご挨拶の改行対応 & ヒーロー画像を全体表示に修正
4fdfae7 GAS をドキュメント用とスプレッドシート用に分離
3b100cc スプレッドシート連携：ご挨拶・役立ち情報・リンク集をデータ化
e0d7b44 初回公開: Jekyll/Markdown ベース PTA サイト
```

---

## 主要ファイル構成

```
PTA-web/
├── _config.yml           # Jekyll 設定（baseurl, title 等）
├── _layouts/
│   └── default.html      # 共通レイアウト（ヘッダー・ナビ・フッター）
├── _data/
│   ├── greeting.json     # ご挨拶テキスト（スプレッドシートから自動更新）
│   └── info.json         # 役立ち情報・リンク集（スプレッドシートから自動更新）
├── data/
│   └── members.json      # 会員限定データ（GAS が暗号化して push）
├── _posts/               # 記事（GAS が自動生成・push）
├── css/
│   └── style.css         # サイトスタイル
├── js/
│   ├── members.js        # 会員限定ページ：復号・認証・自動ログインロジック
│   └── auth.js           # （旧）会員限定コンテンツ制御
├── gas/
│   ├── Code.gs           # Google ドキュメントバインド用（記事投稿・更新・削除）
│   ├── config.gs         # 接続設定（Token 等）。リポジトリには空テンプレートを含む。
│   └── SpreadsheetCode.gs # スプレッドシートバインド用（サイト情報・会員限定更新）
├── docs/
│   ├── requirements.md   # 要件定義書
│   └── setup.md          # 初期設定手順
├── members.html          # 会員限定ページ（ログインフォーム + コンテンツ）
├── index.html            # ホーム
├── event.html            # お知らせ一覧
├── info.html             # 役立ち情報
└── contact.html          # コンタクト
```

---

## 残課題・今後の作業

| # | タスク | 優先度 |
|---|---|---|
| 1 | Google フォームの作成（コンタクト用） | 高 |
| 2 | Google ドライブの整備（会員限定ファイルの共有設定） | 中 |
| 3 | 担当者向けマニュアルの作成（GAS 操作手順・スプレッドシート運用ルールを含む） | 中 |
| 4 | 公開・旧サイトとの並行運用開始 | 中 |
| 5 | 旧サイトアーカイブ（Google ドライブに保存） | 低 |
| 6 | 旧サイト閉鎖 | 低（移行安定後） |
