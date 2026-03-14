/**
 * 川津小学校PTA サイト公開スクリプト（Jekyll / Markdown 版）
 *
 * 【使い方】
 * 1. Google ドキュメントを開く（ドキュメントのファイル名 = 記事タイトル）
 * 2. 本文を書く
 * 3. メニュー「PTA公開」→「このドキュメントを公開する」をクリック
 * 4. 公開日ダイアログで日付を確認・修正して「次へ」→ 内容を確認して「公開する」
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
    .addItem('このドキュメントを公開する', 'publishDocument')
    .addSeparator()
    .addItem('この記事を削除する', 'deleteArticle')
    .addSeparator()
    .addItem('孤立記事をクリーンアップ', 'cleanupOrphanedArticles')
    .addToUi();
}

// ===== 公開ダイアログを表示 =====
function publishDocument() {
  const ui        = DocumentApp.getUi();
  const doc       = DocumentApp.getActiveDocument();
  const articleId = doc.getId();
  const title     = doc.getName();

  // GitHub に既存ファイルがあるか確認し、あれば現在の公開日を初期値に使う
  const existingFile = findGitHubFileById(articleId);
  let defaultDate;
  if (existingFile) {
    const m = existingFile.path.match(/(\d{4}-\d{2}-\d{2})-/);
    defaultDate = m ? m[1] : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  } else {
    defaultDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  const isNew      = !existingFile;
  const existingPath = existingFile ? existingFile.path : '';
  const existingSha  = existingFile ? existingFile.sha  : '';

  // ──────────────────────────────────────────────
  // HTML ダイアログ（3画面構成）
  //   画面1: 公開日入力（本日日付を初期値としてフィールドに入力済み）
  //   画面2: 確認（タイトル・公開日を表示して「公開する」）
  //   画面3: 処理中 → 完了 or エラー
  // ──────────────────────────────────────────────
  const opLabel = isNew ? '新規公開' : '上書き更新';

  const html =
    '<style>' +
    'body{font-family:sans-serif;padding:16px;margin:0;font-size:14px;line-height:1.5;}' +
    'p{margin:0 0 8px;}' +
    '.btn{padding:6px 20px;font-size:14px;cursor:pointer;border-radius:4px;border:none;}' +
    '.primary{background:#1a73e8;color:#fff;}' +
    '.secondary{background:#fff;border:1px solid #999;color:#333;}' +
    'input[type=date]{font-size:15px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;width:160px;}' +
    '#s2,#s3{display:none;}' +
    'table{border-collapse:collapse;width:100%;}' +
    'td{padding:3px 6px;font-size:13px;}' +
    'td:first-child{color:#666;white-space:nowrap;}' +
    '</style>' +

    // ── 画面1: 日付入力 ──
    '<div id="s1">' +
    '<p><b>【' + opLabel + '】</b>' + escapeHtml(title) + '</p>' +
    '<p>公開日：</p>' +
    '<input id="d" type="date" value="' + defaultDate + '">' +
    '<p id="err" style="color:red;display:none;margin-top:6px;">YYYY-MM-DD 形式で入力してください</p>' +
    '<div style="margin-top:16px;">' +
    '<button class="btn primary" onclick="toConfirm()">次へ</button>' +
    '<button class="btn secondary" onclick="google.script.host.close()" style="margin-left:8px;">キャンセル</button>' +
    '</div></div>' +

    // ── 画面2: 確認 ──
    '<div id="s2">' +
    '<p>以下の内容で公開します。よろしいですか？</p>' +
    '<table><tr><td>操作</td><td><b>' + opLabel + '</b></td></tr>' +
    '<tr><td>タイトル</td><td id="c-title"></td></tr>' +
    '<tr><td>公開日</td><td id="c-date"></td></tr></table>' +
    '<p style="margin-top:8px;font-size:12px;color:#666;">画像は Google ドライブに自動保存されます。<br>公開後は数分でサイトに反映されます。</p>' +
    '<div style="margin-top:12px;">' +
    '<button class="btn primary" onclick="doPublish()">公開する</button>' +
    '<button class="btn secondary" onclick="back()" style="margin-left:8px;">戻る</button>' +
    '</div></div>' +

    // ── 画面3: 処理中 / 完了 / エラー ──
    '<div id="s3">' +
    '<p id="s3-msg">処理中…しばらくお待ちください。</p>' +
    '<button id="s3-btn" class="btn primary" style="display:none;" onclick="google.script.host.close()">閉じる</button>' +
    '</div>' +

    // ── JavaScript ──
    '<script>' +
    'var sel;' +
    'var title=' + JSON.stringify(title) + ';' +
    'var ePath=' + JSON.stringify(existingPath) + ';' +
    'var eSha='  + JSON.stringify(existingSha)  + ';' +

    // 画面1→2: バリデーション
    'function toConfirm(){' +
    '  var v=document.getElementById("d").value;' +
    '  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(v)){' +
    '    document.getElementById("err").style.display="block";return;' +
    '  }' +
    '  document.getElementById("err").style.display="none";' +
    '  sel=v;' +
    '  document.getElementById("c-title").textContent=title;' +
    '  document.getElementById("c-date").textContent=v;' +
    '  document.getElementById("s1").style.display="none";' +
    '  document.getElementById("s2").style.display="block";' +
    '}' +

    // 画面2→1: 戻る
    'function back(){' +
    '  document.getElementById("s2").style.display="none";' +
    '  document.getElementById("s1").style.display="block";' +
    '}' +

    // 画面2→3: 公開実行
    'function doPublish(){' +
    '  document.getElementById("s2").style.display="none";' +
    '  document.getElementById("s3").style.display="block";' +
    '  google.script.run' +
    '    .withSuccessHandler(function(msg){' +
    '      document.getElementById("s3-msg").textContent=msg;' +
    '      document.getElementById("s3-btn").style.display="inline-block";' +
    '    })' +
    '    .withFailureHandler(function(e){' +
    '      document.getElementById("s3-msg").textContent="エラーが発生しました:\\n"+e.message;' +
    '      document.getElementById("s3-btn").style.display="inline-block";' +
    '    })' +
    '    .continuePublish(sel,ePath,eSha);' +
    '}' +
    '<\/script>';

  ui.showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(400).setHeight(260),
    '記事を公開する'
  );
}

// ===== 公開の実際の処理（HTML ダイアログから google.script.run で呼ばれる） =====
function continuePublish(publishDate, existingPath, existingSha) {
  const doc       = DocumentApp.getActiveDocument();
  const title     = doc.getName();
  const articleId = doc.getId();

  const existingFile = existingPath ? { path: existingPath, sha: existingSha } : null;
  const isNew        = !existingFile;
  const filename     = publishDate + '-' + articleId + '.md';
  const filepath     = '_posts/' + filename;

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

  return '「' + title + '」を' + (isNew ? '公開' : '更新') + 'しました！\n' +
         '数分後にサイトに反映されます。';
}

// ===== 記事の削除 =====
function deleteArticle() {
  const ui        = DocumentApp.getUi();
  const doc       = DocumentApp.getActiveDocument();
  const articleId = doc.getId();

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

// ===== 孤立記事のクリーンアップ =====
// GitHub _posts/ にあるファイルの docId に対応する Google Doc が
// 存在しない（または削除済み・ゴミ箱入り）場合に GitHub と Drive から削除する
function cleanupOrphanedArticles() {
  const ui = DocumentApp.getUi();

  // GitHub から _posts/ のファイル一覧を取得
  const url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
              '/contents/_posts?ref=' + GITHUB_BRANCH;
  const res = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'token ' + GITHUB_TOKEN },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    ui.alert('エラー', 'GitHub のファイル一覧取得に失敗しました。\n\nHTTP ' + res.getResponseCode(), ui.ButtonSet.OK);
    return;
  }

  const files = JSON.parse(res.getContentText());
  const orphaned = [];

  for (const file of files) {
    // ファイル名から docId を抽出（yyyy-mm-dd-{docId}.md）
    const m = file.name.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
    if (!m) continue;
    const docId = m[1];

    // 移行済み記事（migrated- プレフィックス）は Google Doc が存在しないので除外
    if (docId.indexOf('migrated-') === 0) continue;

    // Doc が存在するか確認
    // ・DriveApp.getFileById() が例外 → 完全に削除済み
    // ・取得できても isTrashed() が true  → ゴミ箱入り
    let isOrphaned = false;
    try {
      const driveFile = DriveApp.getFileById(docId);
      if (driveFile.isTrashed()) isOrphaned = true;
    } catch (e) {
      isOrphaned = true;
    }

    if (isOrphaned) {
      orphaned.push({ name: file.name, path: file.path, sha: file.sha, docId: docId });
    }
  }

  if (orphaned.length === 0) {
    ui.alert('確認完了', '孤立した記事はありませんでした。', ui.ButtonSet.OK);
    return;
  }

  // 削除対象を一覧表示して確認
  const nameList = orphaned.map(function(f) { return '・' + f.name; }).join('\n');
  const result = ui.alert(
    '孤立記事の削除',
    '対応するドキュメントが削除済み（またはゴミ箱入り）の記事が ' + orphaned.length + ' 件あります。\n\n' +
    nameList + '\n\n' +
    'GitHub と Drive の画像フォルダから削除しますか？',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  const errors = [];
  for (const f of orphaned) {
    try {
      deleteFromGitHub(f.path, f.sha, '孤立記事を削除: ' + f.name);
      deleteDriveFolder(f.docId);
    } catch (e) {
      errors.push(f.name + ': ' + e.message);
    }
  }

  if (errors.length > 0) {
    ui.alert(
      '一部エラー',
      (orphaned.length - errors.length) + ' 件削除、' + errors.length + ' 件失敗しました。\n\n' + errors.join('\n'),
      ui.ButtonSet.OK
    );
  } else {
    ui.alert('削除完了', orphaned.length + ' 件の孤立記事を削除しました。', ui.ButtonSet.OK);
  }
}

// ===== HTML 用エスケープ =====
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
      let imageGroup  = [];  // 同じ段落内の連続画像をまとめる

      // 画像グループを Markdown/HTML に変換して出力する内部関数
      const flushImages = function() {
        if (imageGroup.length === 0) return;
        if (imageGroup.length === 1) {
          // 1枚だけ → 通常の Markdown 画像記法
          markdown += imageGroup[0] + '\n\n';
        } else {
          // 複数枚 → photo-grid で3列表示
          const imgTags = imageGroup.map(function(md) {
            const m = md.match(/!\[[^\]]*\]\(([^)]+)\)/);
            return m
              ? '<img src="' + m[1] + '" alt="写真">'
              : md;
          });
          markdown += '<div class="photo-grid">\n' +
                      imgTags.join('\n') + '\n</div>\n\n';
        }
        imageGroup = [];
      };

      for (let j = 0; j < numParaChildren; j++) {
        const child = para.getChild(j);
        if (child.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
          // テキストが先にあれば先に出力してから画像グループに追加
          if (textContent.trim()) {
            flushImages();
            markdown += applyHeading(heading, textContent.trim()) + '\n\n';
            textContent = '';
          }
          imageGroup.push(saveImageToMarkdown(child.asInlineImage(), articleId));
        } else if (child.getType() === DocumentApp.ElementType.TEXT) {
          const t = convertTextToMarkdown(child.asText());
          // テキストが来たら溜まっている画像グループを先に出力
          if (t.trim()) flushImages();
          textContent += t;
        }
      }

      flushImages();  // 段落末尾に残った画像を出力
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
