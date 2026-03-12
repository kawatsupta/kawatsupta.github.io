/**
 * 川津小学校PTA サイト公開スクリプト（Jekyll / Markdown 版）
 *
 * 【使い方】
 * 1. Google ドキュメントを開く
 * 2. メニューに「PTA公開」が表示される
 * 3. 「新規記事テンプレートを作成」でひな形ドキュメントを作成
 * 4. ファイル名を記事タイトルに変更し本文を書く
 * 5. 「このドキュメントを公開する」をクリック → 公開日をダイアログで入力
 *
 * 【記事 ID の仕組み】
 * ドキュメントの固有 ID（URL の d/ 以降）を記事 ID として使用します。
 * ファイル名を変えても記事の同一性が保たれ、GitHub との整合が保証されます。
 * ID はどこにも手動入力不要です。
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
  const doc = DocumentApp.create('【タイトルを入力】');

  // 本文の初期テキスト
  const body = doc.getBody();
  body.clear();
  body.appendParagraph('ここに本文を書いてください。');

  const ui = DocumentApp.getUi();
  ui.alert(
    '新規記事テンプレートを作成しました',
    '以下の URL を開いて記事を書いてください。\n\n' + doc.getUrl() +
    '\n\n【記入方法】\n' +
    '・ドキュメントのファイル名 → 記事タイトルになります\n' +
    '・公開日: 「このドキュメントを公開する」クリック時にダイアログで入力します\n\n' +
    '※ページヘッダーへの入力は不要です。',
    ui.ButtonSet.OK
  );
}

// ===== 公開 =====
function publishDocument() {
  _publish();
}

// ===== メインの公開処理 =====
function _publish() {
  const ui  = DocumentApp.getUi();
  const doc = DocumentApp.getActiveDocument();
  const title     = doc.getName();
  const articleId = doc.getId();  // ドキュメント固有 ID を記事 ID として使用

  // 公開日をダイアログで入力（既存ファイルがあれば現在の公開日を事前取得）
  const existingFile = findGitHubFileById(articleId);
  let defaultDate;
  if (existingFile) {
    // 既存ファイル名から公開日を抽出（yyyy-mm-dd-{id}.md）
    const m = existingFile.path.match(/(\d{4}-\d{2}-\d{2})-/);
    defaultDate = m ? m[1] : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  } else {
    defaultDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  const response = ui.prompt(
    '公開日を入力してください',
    'YYYY-MM-DD 形式で入力してください（例: ' + defaultDate + '）',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) {
    ui.alert('キャンセルしました。');
    return;
  }

  const publishDate = response.getResponseText().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
    ui.alert('エラー', '公開日の形式が正しくありません。YYYY-MM-DD で入力してください（例: 2026-01-22）。', ui.ButtonSet.OK);
    return;
  }

  const isNew    = !existingFile;
  const filename = publishDate + '-' + articleId + '.md';
  const filepath = '_posts/' + filename;

  // 確認ダイアログ
  const confirmMsg =
    (isNew ? '【新規公開】' : '【上書き更新】') + '\n\n' +
    'タイトル: ' + title + '\n' +
    '公開日: ' + publishDate + '\n\n' +
    '※ドキュメント内の画像は Google ドライブに自動保存されます。\n' +
    '※公開後は数分でサイトに反映されます。';

  const result = ui.alert('公開確認', confirmMsg, ui.ButtonSet.YES_NO);
  if (result !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }

  try {
    // 更新の場合：旧画像を削除してから Markdown 変換（新画像を保存）
    if (!isNew) {
      clearDriveFolder(articleId);
    }

    // Markdown 変換（画像は新しく Drive に保存される）
    const markdown = convertDocToMarkdown(doc, title, publishDate, articleId);

    // 更新の場合：公開日が変わった旧ファイルを削除
    if (!isNew && existingFile.path !== filepath) {
      deleteFromGitHub(existingFile.path, existingFile.sha, '旧記事ファイルを削除: ' + title);
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
  const ui  = DocumentApp.getUi();
  const doc = DocumentApp.getActiveDocument();
  const articleId = doc.getId();  // ドキュメント固有 ID を使用

  // GitHub に公開済みか確認
  const existingFile = findGitHubFileById(articleId);
  if (!existingFile) {
    ui.alert('エラー', 'このドキュメントはまだ GitHub に公開されていません。', ui.ButtonSet.OK);
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
    deleteFromGitHub(existingFile.path, existingFile.sha, '記事を削除: ' + doc.getName());

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
function convertDocToMarkdown(doc, title, publishDate, articleId) {
  const body = doc.getBody();
  let markdown = '';

  // Jekyll フロントマターを生成
  markdown += '---\n';
  markdown += 'title: "' + title.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"\n';
  markdown += 'date: ' + publishDate + '\n';
  markdown += 'layout: post\n';
  markdown += '---\n\n';

  // ドキュメント本文を段落単位で変換
  const numElements = body.getNumChildren();
  for (let i = 0; i < numElements; i++) {
    const element = body.getChild(i);
    const type    = element.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const para    = element.asParagraph();
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
    const end   = (i + 1 < indices.length) ? indices[i + 1] : fullText.length;
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

// ===== ヘディングスタイルを Markdown に変換 =====
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

// ===== MIMEタイプから拡張子を返す =====
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
    branch:  GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;

  const putRes = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: {
      'Authorization': 'token ' + GITHUB_TOKEN,
      'Content-Type':  'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = putRes.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub API エラー: HTTP ' + code + '\n' + putRes.getContentText());
  }
}
