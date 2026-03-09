/**
 * 川津小学校PTA サイト公開スクリプト（Jekyll / Markdown 版）
 *
 * 【使い方】
 * 1. Google ドキュメントを開く
 * 2. メニューに「PTA公開」が表示される
 * 3. 「このドキュメントを公開する」をクリック
 * 4. 確認ダイアログで「はい」→ 数分以内にサイトに反映される
 *
 * 【ドキュメントの書き方】
 * ・ドキュメントのファイル名 → 記事タイトルになります
 * ・1行目に日付（例: 2026-01-22）を記入してください
 * ・2行目以降が記事本文です
 * ・ドキュメントに直接貼り付けた画像は、Google ドライブに自動保存されます
 *
 * 【初期設定（スクリプトプロパティに以下を設定）】
 * GITHUB_TOKEN  : GitHub Fine-grained Personal Access Token (Contents: Read and Write)
 * GITHUB_OWNER  : GitHub アカウント名 (例: kawatsupta)
 * GITHUB_REPO   : リポジトリ名 (例: kawatsu-pta-web)
 */

// ===== メニューを追加 =====
function onOpen() {
  DocumentApp.getUi()
    .createMenu('PTA公開')
    .addItem('このドキュメントを公開する', 'publishDocument')
    .addSeparator()
    .addItem('会員限定として公開する', 'publishDocumentMembersOnly')
    .addToUi();
}

// ===== 公開（通常） =====
function publishDocument() {
  _publish(false);
}

// ===== 公開（会員限定） =====
function publishDocumentMembersOnly() {
  _publish(true);
}

// ===== メインの公開処理 =====
function _publish(membersOnly) {
  const ui = DocumentApp.getUi();
  const doc = DocumentApp.getActiveDocument();

  const title = doc.getName();
  const body = doc.getBody();
  const firstParagraph = body.getParagraphs()[0].getText().trim();

  // 1行目が日付（YYYY-MM-DD形式）かチェック
  let date = '';
  let contentStartIndex = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(firstParagraph)) {
    date = firstParagraph;
    contentStartIndex = 1;
  } else {
    date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    contentStartIndex = 0;
    ui.alert(
      '日付の設定',
      '1行目に日付（例: 2026-01-22）が見つからなかったため、今日の日付（' + date + '）を使用します。',
      ui.ButtonSet.OK
    );
  }

  // --- 確認ダイアログ ---
  const confirmMsg =
    '以下の内容でWebサイトに公開します。よろしいですか？\n\n' +
    'タイトル: ' + title + '\n' +
    '日付: ' + date + '\n' +
    (membersOnly ? '種別: 会員限定\n' : '') +
    '\n※ドキュメント内の画像はGoogle ドライブに自動保存されます。\n' +
    '※公開後は数分でサイトに反映されます。';

  const result = ui.alert('公開確認', confirmMsg, ui.ButtonSet.YES_NO);
  if (result !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }

  // --- Markdown に変換して GitHub に push ---
  const slug = slugify(title);
  const filename = date + '-' + slug + '.md';
  const filepath = '_posts/' + filename;

  try {
    const markdown = convertDocToMarkdown(doc, contentStartIndex, title, date, membersOnly);
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
function convertDocToMarkdown(doc, startIndex, title, date, membersOnly) {
  const body = doc.getBody();
  let markdown = '';

  // Jekyll フロントマターを生成
  markdown += '---\n';
  markdown += 'title: "' + title.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"\n';
  markdown += 'date: ' + date + '\n';
  if (membersOnly) markdown += 'members_only: true\n';
  markdown += 'layout: post\n';
  markdown += '---\n\n';

  // ドキュメント本文を段落単位で変換
  let elementCount = 0;
  const numElements = body.getNumChildren();

  for (let i = 0; i < numElements; i++) {
    const element = body.getChild(i);
    const type = element.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      // startIndex でスキップ（日付行を除外）
      if (elementCount < startIndex) {
        elementCount++;
        continue;
      }
      elementCount++;

      const para = element.asParagraph();
      const heading = para.getHeading();
      const numParaChildren = para.getNumChildren();
      let textContent = '';

      for (let j = 0; j < numParaChildren; j++) {
        const child = para.getChild(j);
        if (child.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
          // テキストが前にある場合は先に出力
          if (textContent.trim()) {
            markdown += applyHeading(heading, textContent.trim()) + '\n\n';
            textContent = '';
          }
          // 画像を Google ドライブに保存して Markdown の img 記法を挿入
          markdown += saveImageToMarkdown(child.asInlineImage()) + '\n\n';
        } else if (child.getType() === DocumentApp.ElementType.TEXT) {
          textContent += child.asText().getText();
        }
      }

      if (textContent.trim()) {
        markdown += applyHeading(heading, textContent.trim()) + '\n\n';
      }

    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      if (elementCount < startIndex) {
        continue;
      }
      const listItem = element.asListItem();
      const text = listItem.getText().trim();
      if (!text) continue;
      const nestingLevel = listItem.getNestingLevel();
      const indent = '  '.repeat(nestingLevel);
      markdown += indent + '- ' + text + '\n';
    }
  }

  return markdown.trim() + '\n';
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
function saveImageToMarkdown(inlineImage) {
  const blob = inlineImage.getBlob();

  // 保存先フォルダを取得または作成
  let folder;
  const folders = DriveApp.getFoldersByName('PTA-web-images');
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder('PTA-web-images');
  }
  // フォルダを「リンクを知っている人が閲覧可能」に設定
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // ファイル名を生成（タイムスタンプで重複回避）
  const ext = getMimeExtension(blob.getContentType());
  const filename = 'img-' + new Date().getTime() + '.' + ext;
  blob.setName(filename);

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();
  // lh3.googleusercontent.com は Google の CDN で、uc?id= より安定して画像表示できる
  return '![写真](https://lh3.googleusercontent.com/d/' + fileId + ')';
}

// MIMEタイプから拡張子を返す
function getMimeExtension(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp'
  };
  return map[mimeType] || 'jpg';
}

// ===== GitHub API でファイルを作成・更新 =====
function pushToGitHub(filepath, content, commitMessage) {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('GITHUB_OWNER');
  const repo = props.getProperty('GITHUB_REPO');
  const token = props.getProperty('GITHUB_TOKEN');

  if (!owner || !repo || !token) {
    throw new Error(
      'スクリプトプロパティが設定されていません。\n' +
      'GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO を設定してください。'
    );
  }

  const apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filepath;

  // 既存ファイルの SHA を取得（更新時に必要）
  let sha;
  const getRes = UrlFetchApp.fetch(apiUrl, {
    headers: { 'Authorization': 'token ' + token },
    muteHttpExceptions: true
  });
  if (getRes.getResponseCode() === 200) {
    sha = JSON.parse(getRes.getContentText()).sha;
  }

  // ファイルを作成または更新
  const payload = {
    message: commitMessage,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: 'main'
  };
  if (sha) payload.sha = sha;

  const putRes = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: {
      'Authorization': 'token ' + token,
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
  // ファイル名として安全な文字のみ残す（日本語対応）
  return str
    .replace(/[^\w\u3040-\u30FF\u4E00-\u9FFF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}
