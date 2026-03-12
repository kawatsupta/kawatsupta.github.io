/**
 * 川津小学校PTA サイト公開スクリプト（Jekyll / Markdown 版）
 *
 * 【使い方】
 * 1. Google ドキュメントを開く
 * 2. メニューに「PTA公開」が表示される
 * 3. 「新規記事テンプレートを作成」でひな形ドキュメントを作成
 * 4. タイトル・ID・公開日・本文を入力し「このドキュメントを公開する」をクリック
 *
 * 【ドキュメントの構成】
 * ┌──────────┬──────────────────┐
 * │ ID       │ 20260122-oyako   │ ← 記事ごとに一意な識別子（画像フォルダ名にも使用）
 * ├──────────┼──────────────────┤
 * │ 公開日   │ 2026-01-22       │ ← サイトに表示される日付（YYYY-MM-DD）
 * ├──────────┼──────────────────┤
 * │ 更新日   │                  │ ← 記事を修正した日（初回は空欄でOK）
 * └──────────┴──────────────────┘
 * （空行）
 * ここから本文...
 *
 * 【初期設定】
 * config.gs に GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO を入力してください。
 * config.gs は .gitignore で管理対象外になっています。
 */

// ===== メニューを追加 =====
function onOpen() {
  DocumentApp.getUi()
    .createMenu('PTA公開')
    .addItem('新規記事テンプレートを作成', 'createNewArticle')
    .addSeparator()
    .addItem('このドキュメントを公開する', 'publishDocument')
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
    ['ID',    ''],
    ['公開日', today],
    ['更新日', '']
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
    '・ID: 記事を識別する短い名前（例: 20260122-oyako）\n' +
    '  ※半角英数字とハイフンのみ推奨。画像フォルダ名にも使われます。\n' +
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
  let articleId, publishDate, updateDate;
  const firstElement = body.getChild(0);

  if (firstElement.getType() === DocumentApp.ElementType.TABLE) {
    const table = firstElement.asTable();
    articleId  = table.getCell(0, 1).getText().trim();
    publishDate = table.getCell(1, 1).getText().trim();
    updateDate  = table.getCell(2, 1).getText().trim();
  } else {
    // 旧形式（1行目に日付）へのフォールバック
    const firstPara = body.getParagraphs()[0].getText().trim();
    publishDate = /^\d{4}-\d{2}-\d{2}$/.test(firstPara)
      ? firstPara
      : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    articleId  = slugify(title);
    updateDate = '';
  }

  // バリデーション
  if (!articleId) {
    ui.alert('エラー', 'ID が入力されていません。テーブルの ID 欄を入力してください。', ui.ButtonSet.OK);
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
    ui.alert('エラー', '公開日の形式が正しくありません。YYYY-MM-DD で入力してください（例: 2026-01-22）。', ui.ButtonSet.OK);
    return;
  }

  // 確認ダイアログ
  const confirmMsg =
    '以下の内容でWebサイトに公開します。よろしいですか？\n\n' +
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

  const safeId  = slugify(articleId);
  const filename = publishDate + '-' + safeId + '.md';
  const filepath = '_posts/' + filename;

  try {
    const markdown = convertDocToMarkdown(doc, title, publishDate, updateDate, safeId);
    pushToGitHub(filepath, markdown, title + ' を公開');
    ui.alert(
      '公開完了',
      '「' + title + '」を公開しました！\n数分後にサイトに反映されます。\n\nファイル: ' + filename,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('エラー', '公開に失敗しました。\n\nエラー内容:\n' + e.message, ui.ButtonSet.OK);
    console.error(e);
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

  const apiUrl = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + filepath;

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

// ===== ユーティリティ =====
function slugify(str) {
  return str
    .replace(/[^\w\u3040-\u30FF\u4E00-\u9FFF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}
