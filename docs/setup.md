# セットアップ手順書

## 概要
このドキュメントは、川津小学校PTA Webサイトを GitHub Pages で公開するための手順書です。

### アーキテクチャ概要

```
Google ドキュメント（記事作成）
        ↓ 「PTA公開」メニュー（GAS）
GitHub リポジトリ（_posts/*.md）
        ↓ Jekyll ビルド（GitHub Pages が自動実行）
公開 Web サイト（https://アカウント名.github.io/kawatsu-pta-web/）
```

- 記事は **Markdown ファイル**として `_posts/` フォルダに保存されます
- Google ドキュメントに貼り付けた画像は、GAS が自動的に Google ドライブに保存してリンクを埋め込みます
- GitHub Pages は Jekyll を使って自動的にサイトをビルドします

---

## ステップ1：GitHub リポジトリを作成する

1. GitHub にログインする（PTA 共有アカウントを使用）
2. 右上の「+」→「New repository」をクリック
3. Repository name に **`kawatsu-pta-web`** と入力
4. Public を選択
5. 「Create repository」をクリック

---

## ステップ2：ファイルをアップロードする

### 方法A: GitHub のWebブラウザから（簡単）

1. 作成したリポジトリを開く
2. 「uploading an existing file」をクリック
3. このプロジェクトのファイルを全て drag & drop する
4. 「Commit changes」をクリック

### 方法B: git コマンドを使う（開発者向け）

```bash
cd /Users/norio/my-project/PTA-web
git init
git add .
git commit -m "初回公開"
git remote add origin https://github.com/アカウント名/kawatsu-pta-web.git
git push -u origin main
```

---

## ステップ3：GitHub Pages を有効にする

1. リポジトリの「Settings」タブを開く
2. 左メニュー「Pages」をクリック
3. Source を「Deploy from a branch」に設定
4. Branch を `main` / `/ (root)` に設定
5. 「Save」をクリック
6. 数分後に `https://アカウント名.github.io/kawatsu-pta-web/` でアクセスできるようになる

> **補足**: このサイトは Jekyll を使用しています。GitHub Pages は `Gemfile` を検出すると自動的に Jekyll でビルドします。特別な設定は不要です。

---

## ステップ4：GitHub Personal Access Token を作成する

GAS スクリプトが GitHub に記事を投稿するために必要です。
**Fine-grained token** を使用します（特定リポジトリのみに権限を限定できるため、Classic より安全です）。

1. GitHub にログインし、右上のアイコン →「Settings」を開く
2. 左メニュー最下部「Developer settings」をクリック
3. 「Personal access tokens」→ **「Fine-grained tokens」** をクリック
4. 「Generate new token」をクリック
5. 設定内容:

| 項目 | 設定値 |
|---|---|
| Token name | `PTA-web GAS` |
| Expiration | 任意（1年推奨） |
| Resource owner | 自分のアカウント |
| Repository access | **Only select repositories** → `kawatsu-pta-web` を選択 |
| Permissions → Contents | **Read and Write** |

6. 「Generate token」をクリック
7. 表示されたトークンを**必ずコピーして保存**する（一度しか表示されません）

> **補足**: Fine-grained token は `kawatsu-pta-web` リポジトリ以外には一切アクセスできません。
> 万が一トークンが漏れた場合でも被害を最小限に抑えられます。

---

## ステップ5：GAS スクリプトを設定する

### 5-1. Google ドキュメントにスクリプトを追加

1. PTA 共有 Google アカウントで Google ドキュメントを開く（新規でも可）
2. メニュー「拡張機能」→「Apps Script」をクリック
3. 「Code.gs」の内容を削除し、`gas/Code.gs` の内容を貼り付ける
4. 「保存」をクリック（Ctrl+S）

### 5-2. スクリプトプロパティを設定

1. Apps Script 画面の左メニュー「プロジェクトの設定」（歯車アイコン）をクリック
2. 「スクリプト プロパティ」欄で「スクリプト プロパティを追加」をクリック
3. 以下の3つを登録する:

| プロパティ名 | 値 |
|---|---|
| `GITHUB_TOKEN` | ステップ4で取得したトークン |
| `GITHUB_OWNER` | GitHub のアカウント名（例: `kawatsupta`） |
| `GITHUB_REPO` | リポジトリ名（例: `kawatsu-pta-web`） |

4. 「スクリプト プロパティを保存」をクリック

### 5-3. スクリプトを承認する

1. Apps Script 画面に戻り「実行」→「onOpen」を実行する
2. 権限の確認ダイアログが出たら「権限を確認」→「許可」をクリック

---

## ステップ6：Google ドライブを整備する

### 会員限定ファイルの共有設定

1. Google ドライブで共有したいファイルを右クリック →「共有」
2. 「リンクを知っている全員」に変更し「閲覧者」を設定
3. 「リンクをコピー」してリンクを `info.html` に貼り付ける

### ヒーロー画像の設定

1. 学校の写真を Google ドライブにアップ
2. ファイルを右クリック →「共有」→「リンクを知っている全員」→「閲覧者」
3. ファイル ID を取得（リンク中の `https://drive.google.com/file/d/【ここ】/view`）
4. `index.html` の `hero.jpg` を以下のURLに差し替える:
   ```
   https://drive.google.com/uc?id=ファイルID&export=view
   ```

---

## ステップ7：Google フォームを設定する（コンタクトページ）

1. Google フォームで新規フォームを作成
2. 項目例: お名前、メールアドレス、お問い合わせ内容
3. フォームの「送信」→リンクアイコン → URL をコピー
4. `contact.html` の `#GOOGLE_FORM_URL` をそのURLに差し替える

---

## 記事の投稿方法（運用開始後）

### 1. Google ドキュメントを作成する

| 項目 | 書き方 |
|---|---|
| ファイル名 | 記事タイトルそのまま（例: `3年生親子活動@川津小`）|
| 1行目 | 日付（例: `2026-01-22`）※省略すると今日の日付になります |
| 2行目以降 | 記事本文 |

**見出しの使い方**: Google ドキュメントの「見出し1」「見出し2」は `##`、「見出し3」は `###` として変換されます。

### 2. 画像を挿入する

写真はそのまま **Google ドキュメントに貼り付けるだけ**です。
公開時に GAS が自動的に Google ドライブの `PTA-web-images` フォルダに保存し、リンクを埋め込みます。

> 以前のバージョンで使用していた `[画像: DRIVE_FILE_ID]` 記法は不要になりました。

### 3. 公開する

メニューバーの **「PTA公開」** から選択します:

| メニュー項目 | 用途 |
|---|---|
| このドキュメントを公開する | 通常の記事（全員が閲覧可能） |
| 会員限定として公開する | 「会員限定」バッジが付き、お知らせ一覧でも識別可能 |

確認ダイアログで「はい」を選ぶと、数分でサイトに反映される。

> **仕組み**: GAS が Google ドキュメントを Markdown に変換し、`_posts/YYYY-MM-DD-タイトル.md` として GitHub に push します。その後 GitHub Pages が Jekyll でビルドして自動公開されます。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| サイトにアクセスできない | GitHub Pages の設定を再確認。反映に10分ほどかかる場合あり |
| 公開ボタンが出ない | Apps Script を開き onOpen を実行。権限を再承認する |
| GitHub API エラー | スクリプトプロパティの GITHUB_TOKEN が正しいか確認。トークンの有効期限切れの可能性あり |
| 記事が反映されない | GitHub リポジトリの「Actions」タブを開き、赤い ✗ が出ていたらビルドエラーあり。クリックで詳細を確認 |
| Jekyll ビルドエラー | Actions タブのエラー内容を確認。記事の Markdown に不正な文字（特に `---` の記法ミス）が含まれている可能性あり |
| 画像が表示されない | Google ドライブの `PTA-web-images` フォルダを開き、該当ファイルの共有設定が「リンクを知っている全員が閲覧可能」になっているか確認 |
