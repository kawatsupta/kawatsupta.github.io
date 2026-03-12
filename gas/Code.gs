/**
 * 川津小学校PTA サイト公開スクリプト（Jekyll / Markdown 版）
 *
 * 【使い方】
 * 1. Google ドキュメントを開く
 * 2. メニューに「PTA公開」が表示される
 * 3. 「新規記事テンプレートを作成」でひな形ドキュメントを作成
 * 4. タイトル・公開日・本文を入力し「このドキュメントを公開する」をクリック
 *
 * 【ドキュメントの構成】
 * ┌────────────────┬──────────────────┐
 * │ ID（自動入力） │ 20260312143055   │ ← 公開時に自動採番。空欄のままにしておく。
 * ├────────────────┼──────────────────┤
 * │ 公開日         │ 2026-01-22       │ ← サイトに表示される日付（YYYY-MM-DD）
 * ├────────────────┼──────────────────┤
 * │ 更新日         │                  │ ← 記事を修正した日（初回は空欄でOK）
 * └────────────────┴──────────────────┘
 * （空行）
 * ここから本文...
 *
 * 【初期設定】
 * config.gs に GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO を入力してください。
 */

// ===== メニューを追加 =====
function onOpen() {
  DocumentApp.getUi()
    .createMenu('PTA公開')
    .addItem('新規記事テンプレートを作成', 'createNewArticle')
    .addSeparator()
    .addItem('このドキュメントを公開する', 'publishDocument')
    .addSeparator()
    .addItem('この記事を削除する', 'deleteArticle')
    .addToUi();
}

// ===== 新規記事テンプレートを作成 =====
function createNewArticle() {
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const doc = DocumentApp.create('【タイトルを入力】');
  const body = doc.getBody();
  body.clear();

  // 公開情報テーブル
  const table = body.appendTable([
    ['ID（自動入力）', ''],
    ['公開日',         today],
    ['更新日',         '']
  ]);
  // ラベル列をグレー背景に
  for (let i = 0; i < 3; i++) {
    table.getCell(i, 0).setBackgroundColor('#eeeeee');
  }

  body.appendParagraph('');
  body.appendParagraph('ここに本文を書いてください。');

  const ui = DocumentApp.getUi();
  ui.alert(
    '新規記事テンプレートを作成しました',
    '以下の URL を開いて記事を書いてください。\n\n' + doc.getUrl() +
    '\n\n【記入方法】\n' +
    '・ドキュメントのファイル名 → 記事タイトルになります\n' +
    '・ID: 公開時に自動入力されます（空欄のままにしてください）\n' +
    '・公開日: サイトに表示する日付（YYYY-MM-DD 形式）\n' +
    '・更新日: 記事を修正した場合に記入。初回は空欄でOK。',
    ui.ButtonSet.OK
  );
}

// ===== 公開 =====
function publishDocument() {
  _publish();
}

// ===== メインの公開処理 =====
function _publish() {
  const ui = DocumentApp.getUi();
  const doc = DocumentApp.getActiveDocument();
  const title = doc.getName();
  const body = doc.getBody();

  // ドキュメント先頭のテーブルから公開情報を読み取る
  let articleId, publishDate, updateDate, headerTable;
  const firstElement = body.getChild(0);

  if (firstElement.getType() === DocumentApp.ElementType.TABLE) {
    headerTable = firstElement.asTable();
    articleId   = headerTable.getCell(0, 1).getText().trim();
    publishDate = headerTable.getCell(1, 1).getText().trim();
    updateDate  = headerTable.getCell(2, 1).getText().trim();
  } else {
    // 旧形式（1行目に日付）へのフォールバック
    const firstText = body.getChild(0).asParagraph
      ? body.getChild(0).asParagraph().getText().trim()
      : '';
    publishDate = /^\d{4}-\d{2}-\d{2}$/.test(firstText)
      ? firstText
      : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    articleId  = '';
    updateDate = '';
    headerTable = null;
  }

  // バリデーション
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
    ui.alert('エラー', '公開日の形式が正しくありません。YYYY-MM-DD で入力してください（例: 2026-01-22）。', ui.ButtonSet.OK);
    return;
  }

  const isNew = !articleId;

  // 新規の場合：ID を自動採番
  if (isNew) {
    articleId = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmss');
  }

  const filename = publishDate + '-' + articleId + '.md';
  const filepath = '_posts/' + filename;

  // 確認ダイアログ
  const confirmMsg =
    (isNew ? '【新規公開】' : '【上書き更新】') + '\n\n' +
    'タイトル: ' + title + '\n' +
    'ID: ' + articleId + '\n' +
    '公開日: ' + publishDate + '\n' +
    (updateDate ? '更新日: ' + updateDate + '\n' : '') +
    '\n※ドキュメント内の画像はGoogle ドライブに自動保存されます。\n' +
    '※公開後は数分でサイトに反映されます。';

  const result = ui.alert('公開確認', confirmMsg, ui.ButtonSet.YES_NO);
  if (result !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }

  try {
    // 新規の場合：採番した ID をドキュメントのヘッダーテーブルに先に書き戻す
    // （GitHub プッシュが失敗しても ID が保持されるよう、最初に実行）
    if (isNew && headerTable) {
      headerTable.getCell(0, 1).setText(articleId);
    }

    // 更新の場合：旧画像を削除してからMarkdown変換（新画像を保存）
    if (!isNew) {
      clearDriveFolder(articleId);
    }

    // Markdown 変換（画像は新しくDriveに保存される）
    const markdown = convertDocToMarkdown(doc, title, publishDate, updateDate, articleId);

    // 更新の場合：公開日が変わった旧ファイルを削除
    if (!isNew) {
      const existingFile = findGitHubFileById(articleId);
      if (existingFile && existingFile.path !== filepath) {
        deleteFromGitHub(existingFile.path, existingFile.sha, '旧記事ファイルを削除: ' + title);
      }
    }

    // GitHub に push
    pushToGitHub(filepath, markdown, (isNew ? '記事を公開: ' : '記事を更新: ') + title);

    ui.alert(
      '公開完了',
      '「' + title + '」を' + (isNew ? '公開' : '更新') + 'しました！\n' +
      '数分後にサイトに反映されます。\n\nファイル: ' + filename,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('エラー', '公開に失敗しました。\n\nエラー内容:\n' + e.message, ui.ButtonSet.OK);
    console.error(e);
  }
}

// ===== 記事の削除 =====
function deleteArticle() {
  const ui = DocumentApp.getUi();
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();

  // ヘッダーテーブルから ID を取得
  const firstElement = body.getChild(0);
  if (firstElement.getType() !== DocumentApp.ElementType.TABLE) {
    ui.alert('エラー', 'ヘッダーテーブルが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const articleId = firstElement.asTable().getCell(0, 1).getText().trim();
  if (!articleId) {
    ui.alert('エラー', 'ID が空です。このドキュメントはまだ公開されていません。', ui.ButtonSet.OK);
    return;
  }

  const result = ui.alert(
    '記事の削除',
    '「' + doc.getName() + '」を削除します。よろしいですか？\n\n' +
    '・GitHub から記事ファイルを削除します\n' +
    '・画像フォルダ（PTA-web-images/' + articleId + '）を削除します\n' +
    '・このドキュメントをゴミ箱に移動します\n\n' +
    '※ドキュメントはゴミ箱から30日間復元できます。',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  try {
    // 1. GitHub のファイルを削除
    const existingFile = findGitHubFileById(articleId);
    if (existingFile) {
      deleteFromGitHub(existingFile.path, existingFile.sha, '記事を削除: ' + doc.getName());
    }

    // 2. Drive の画像フォルダをゴミ箱へ
    deleteDriveFolder(articleId);

    // 3. ドキュメントをゴミ箱へ（最後に実行）
    DriveApp.getFileById(doc.getId()).setTrashed(true);

  } catch (e) {
    ui.alert('エラー', '削除中にエラーが発生しました。\n\n' + e.message, ui.ButtonSet.OK);
  }
}

// ===== GitHub の _posts/ を ID で検索してファイル情報を返す =====
function findGitHubFileById(articleId) {
  const url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
              '/contents/_posts?ref=' + GITHUB_BRANCH;
  const res = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'token ' + GITHUB_TOKEN },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return null;

  const files = JSON.parse(res.getContentText());
  for (const file of files) {
    if (file.name.indexOf(articleId) !== -1) {
      return { path: file.path, sha: file.sha };
    }
  }
  return null;
}

// ===== GitHub からファイルを削除 =====
function deleteFromGitHub(filepath, sha, commitMessage) {
  const url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
              '/contents/' + filepath;
  const res = UrlFetchApp.fetch(url, {
    method: 'delete',
    headers: {
      'Authorization': 'token ' + GITHUB_TOKEN,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ message: commitMessage, sha: sha, branch: GITHUB_BRANCH }),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('GitHub 削除エラー: HTTP ' + code + '\n' + res.getContentText());
  }
}

// ===== Drive の画像フォルダ内ファイルをすべてゴミ箱へ（フォルダ自体は残す） =====
function clearDriveFolder(articleId) {
  const rootFolders = DriveApp.getFoldersByName('PTA-web-images');
  if (!rootFolders.hasNext()) return;
  const rootFolder = rootFolders.next();

  const subFolders = rootFolder.getFoldersByName(articleId);
  if (!subFolders.hasNext()) return;
  const folder = subFolders.next();

  const files = folder.getFiles();
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
}

// ===== Drive の画像フォルダをゴミ箱へ =====
function deleteDriveFolder(articleId) {
  const rootFolders = DriveApp.getFoldersByName('PTA-web-images');
  if (!rootFolders.hasNext()) return;
  const rootFolder = rootFolders.next();

  const subFolders = rootFolder.getFoldersByName(articleId);
  if (subFolders.hasNext()) {
    subFolders.next().setTrashed(true);
  }
}

// ===== Google ドキュメントを Markdown（Jekyll フロントマター付き）に変換 =====
function convertDocToMarkdown(doc, title, publishDate, updateDate, articleId) {
  const body = doc.getBody();
  let markdown = '';

  // Jekyll フロントマターを生成
  markdown += '---\n';
  markdown += 'title: "' + title.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"\n';
  markdown += 'date: ' + publishDate + '\n';
  if (updateDate) markdown += 'updated: "' + updateDate + '"\n';
  markdown += 'layout: post\n';
  markdown += '---\n\n';

  // 本文の開始インデックスを決定（ヘッダーテーブルと空行をスキップ）
  const numElements = body.getNumChildren();
  const firstType = body.getChild(0).getType();
  let startIdx = 0;

  if (firstType === DocumentApp.ElementType.TABLE) {
    // 新形式: テーブルとその直後の空行をスキップ
    startIdx = 1;
    while (startIdx < numElements) {
      const el = body.getChild(startIdx);
      if (el.getType() === DocumentApp.ElementType.PARAGRAPH &&
          !el.asParagraph().getText().trim()) {
        startIdx++;
      } else {
        break;
      }
    }
  } else {
    // 旧形式: 1行目が日付なら読み飛ばす
    const firstText = body.getChild(0).asParagraph
      ? body.getChild(0).asParagraph().getText().trim()
      : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(firstText)) startIdx = 1;
  }

  // ドキュメント本文を段落単位で変換
  for (let i = startIdx; i < numElements; i++) {
    const element = body.getChild(i);
    const type = element.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const para = element.asParagraph();
      const heading = para.getHeading();
      const numParaChildren = para.getNumChildren();
      let textContent = '';

      for (let j = 0; j < numParaChildren; j++) {
        const child = para.getChild(j);
        if (child.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
          if (textContent.trim()) {
            markdown += applyHeading(heading, textContent.trim()) + '\n\n';
            textContent = '';
          }
          markdown += saveImageToMarkdown(child.asInlineImage(), articleId) + '\n\n';
        } else if (child.getType() === DocumentApp.ElementType.TEXT) {
          textContent += convertTextToMarkdown(child.asText());
        }
      }

      if (textContent.trim()) {
        markdown += applyHeading(heading, textContent.trim()) + '\n\n';
      }

    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      const listItem = element.asListItem();
      const text = listItem.getText().trim();
      if (!text) continue;
      const nestingLevel = listItem.getNestingLevel();
      const indent = '  '.repeat(nestingLevel);
      markdown += indent + '- ' + text + '\n';
    }
  }

  return normalizeDriveUrls(markdown.trim() + '\n');
}

// ===== Google Drive URL を安定した CDN 形式に統一 =====
function normalizeDriveUrls(markdown) {
  markdown = markdown.replace(
    /https:\/\/drive\.google\.com\/uc\?[^\s\)"]*/g,
    function(match) {
      var m = match.match(/[?&]id=([A-Za-z0-9_-]+)/);
      return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : match;
    }
  );
  markdown = markdown.replace(
    /https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\/[^\s\)"']*/g,
    'https://lh3.googleusercontent.com/d/$1'
  );
  markdown = markdown.replace(
    /https:\/\/drive\.google\.com\/open\?id=([A-Za-z0-9_-]+)[^\s\)"']*/g,
    'https://lh3.googleusercontent.com/d/$1'
  );
  return markdown;
}

// ===== テキストの書式（太字・斜体・文字色・フォントサイズ）を Markdown/HTML に変換 =====
function convertTextToMarkdown(textObj) {
  const fullText = textObj.getText();
  if (!fullText) return '';

  const indices = textObj.getTextAttributeIndices();
  if (!indices || indices.length === 0) return fullText;

  let result = '';

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = (i + 1 < indices.length) ? indices[i + 1] : fullText.length;
    const segment = fullText.substring(start, end);
    if (!segment) continue;

    const bold     = textObj.isBold(start);
    const italic   = textObj.isItalic(start);
    const color    = textObj.getForegroundColor(start);
    const fontSize = textObj.getFontSize(start);

    const hasColor = color && color !== '#000000';
    const hasSize  = !!fontSize;

    if (hasColor || hasSize) {
      let style = '';
      if (hasColor) style += 'color:' + color + ';';
      if (hasSize)  style += 'font-size:' + fontSize + 'pt;';
      if (bold)     style += 'font-weight:bold;';
      if (italic)   style += 'font-style:italic;';
      result += '<span style="' + style + '">' + segment + '</span>';
    } else if (bold && italic) {
      result += '***' + segment + '***';
    } else if (bold) {
      result += '**' + segment + '**';
    } else if (italic) {
      result += '*' + segment + '*';
    } else {
      result += segment;
    }
  }

  return result;
}

// ヘディングスタイルを Markdown に変換
function applyHeading(heading, text) {
  if (!text) return '';
  if (heading === DocumentApp.ParagraphHeading.HEADING1 ||
      heading === DocumentApp.ParagraphHeading.HEADING2) {
    return '## ' + text;
  }
  if (heading === DocumentApp.ParagraphHeading.HEADING3) {
    return '### ' + text;
  }
  return text;
}

// ===== インライン画像を Google ドライブに保存して Markdown img 記法を返す =====
function saveImageToMarkdown(inlineImage, articleId) {
  const blob = inlineImage.getBlob();

  // ルートフォルダ（PTA-web-images）を取得または作成
  let rootFolder;
  const rootFolders = DriveApp.getFoldersByName('PTA-web-images');
  if (rootFolders.hasNext()) {
    rootFolder = rootFolders.next();
  } else {
    rootFolder = DriveApp.createFolder('PTA-web-images');
  }
  rootFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // 記事 ID ごとのサブフォルダを取得または作成
  let folder;
  const subFolders = rootFolder.getFoldersByName(articleId);
  if (subFolders.hasNext()) {
    folder = subFolders.next();
  } else {
    folder = rootFolder.createFolder(articleId);
  }
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const ext = getMimeExtension(blob.getContentType());
  const filename = 'img-' + new Date().getTime() + '.' + ext;
  blob.setName(filename);

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();
  return '![写真](https://lh3.googleusercontent.com/d/' + fileId + ')';
}

// MIMEタイプから拡張子を返す
function getMimeExtension(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/gif':  'gif',
    'image/webp': 'webp'
  };
  return map[mimeType] || 'jpg';
}

// ===== GitHub API でファイルを作成・更新 =====
function pushToGitHub(filepath, content, commitMessage) {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error(
      'config.gs の設定が不完全です。\n' +
      'GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO を入力してください。'
    );
  }

  const apiUrl = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
                 '/contents/' + filepath;

  // 既存ファイルの sha を取得（上書き更新に必要）
  let sha;
  const getRes = UrlFetchApp.fetch(apiUrl, {
    headers: { 'Authorization': 'token ' + GITHUB_TOKEN },
    muteHttpExceptions: true
  });
  if (getRes.getResponseCode() === 200) {
    sha = JSON.parse(getRes.getContentText()).sha;
  }

  const payload = {
    message: commitMessage,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;

  const putRes = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: {
      'Authorization': 'token ' + GITHUB_TOKEN,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = putRes.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub API エラー: HTTP ' + code + '\n' + putRes.getContentText());
  }
}
