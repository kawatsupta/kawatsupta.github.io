/**
 * 広報誌移行ツール
 *
 * 概要:
 *   現行サイト（kawatsupta.byonia.net）の広報誌一覧ページからPDFをダウンロードし、
 *   Google DriveのフォルダへアップロードするGASスクリプト。
 *
 * 使い方:
 *   1. 下記 CONFIG セクションを編集して実行環境に合わせる
 *   2. Google Apps Script エディタで「migrateNewsletters」を実行
 *   3. 実行ログでアップロード結果を確認する
 *   4. アップロードされたファイルのURLを members.json に反映する
 *
 * 注意:
 *   - 旧サイトがHTTP Basic認証の場合: CONFIG.authType = 'basic'
 *   - フォーム認証の場合: CONFIG.authType = 'form' (初回実行でCookieを取得)
 *   - 旧サイトが既に閉鎖済みの場合は手動アップロードを使用してください
 */

// ===== 設定 =====
var CONFIG = {
  // 広報誌一覧ページのURL
  listUrl: 'http://kawatsupta.byonia.net/kouhoushi/',  // ← 実際のURLに変更

  // 認証方式: 'basic' | 'form' | 'none'
  authType: 'basic',

  // HTTP Basic認証の場合
  basicUser: 'PTA',        // ← 実際のIDに変更
  basicPass: 'YOUR_PASS',  // ← 実際のパスワードに変更

  // アップロード先のGoogle DriveフォルダID
  // フォルダURLの末尾: https://drive.google.com/drive/folders/[このID]
  driveFolderId: '1zCnwbpoT5j4lpaTRItV0L6EZ4br6HvOD',

  // PDFリンクを探す正規表現パターン（旧サイトの構造に合わせて変更）
  pdfLinkPattern: /href="([^"]*\.pdf)"/gi,

  // アップロード済みファイルのURL一覧を出力するか
  outputUrls: true,
};

// ===== メイン処理 =====

function migrateNewsletters() {
  Logger.log('=== 広報誌移行ツール 開始 ===');

  var folder = DriveApp.getFolderById(CONFIG.driveFolderId);
  Logger.log('アップロード先フォルダ: ' + folder.getName());

  // 広報誌一覧ページを取得
  var html = fetchPage(CONFIG.listUrl);
  if (!html) {
    Logger.log('ERROR: 一覧ページの取得に失敗しました。');
    return;
  }

  // PDFリンクを抽出
  var pdfUrls = extractPdfLinks(html, CONFIG.listUrl);
  Logger.log('PDFリンク検出数: ' + pdfUrls.length);

  if (pdfUrls.length === 0) {
    Logger.log('PDFが見つかりませんでした。listUrl と pdfLinkPattern を確認してください。');
    return;
  }

  // 各PDFをダウンロードしてDriveにアップロード
  var results = [];
  pdfUrls.forEach(function(url, i) {
    Logger.log('[' + (i+1) + '/' + pdfUrls.length + '] 処理中: ' + url);
    var result = downloadAndUpload(url, folder);
    results.push(result);
    Utilities.sleep(1000); // レート制限対策
  });

  // 結果サマリー
  Logger.log('\n=== 結果サマリー ===');
  var success = 0, failure = 0;
  results.forEach(function(r) {
    if (r.success) {
      success++;
      Logger.log('✓ ' + r.filename + '\n  URL: ' + r.driveUrl);
    } else {
      failure++;
      Logger.log('✗ ' + r.filename + ' - エラー: ' + r.error);
    }
  });
  Logger.log('\n成功: ' + success + ' / 失敗: ' + failure);

  if (CONFIG.outputUrls) {
    Logger.log('\n=== members.json用URLリスト ===');
    results.filter(function(r){ return r.success; }).forEach(function(r) {
      Logger.log(JSON.stringify({
        label: r.filename.replace('.pdf', ''),
        url: r.driveUrl,
        size: r.sizeLabel
      }));
    });
  }
}

// ===== ページ取得 =====

function fetchPage(url) {
  try {
    var options = buildFetchOptions('GET', null);
    var resp = UrlFetchApp.fetch(url, options);
    if (resp.getResponseCode() !== 200) {
      Logger.log('HTTP ' + resp.getResponseCode() + ': ' + url);
      return null;
    }
    return resp.getContentText('UTF-8');
  } catch (e) {
    Logger.log('fetchPage error: ' + e);
    return null;
  }
}

function buildFetchOptions(method, payload) {
  var options = {
    method: method || 'GET',
    muteHttpExceptions: true,
    followRedirects: true,
  };
  if (CONFIG.authType === 'basic') {
    var cred = Utilities.base64Encode(CONFIG.basicUser + ':' + CONFIG.basicPass);
    options.headers = { 'Authorization': 'Basic ' + cred };
  }
  if (payload) options.payload = payload;
  return options;
}

// ===== PDFリンク抽出 =====

function extractPdfLinks(html, baseUrl) {
  var urls = [];
  var base = new RegExp('^https?://');
  var pattern = CONFIG.pdfLinkPattern;
  // パターンをリセット（グローバルフラグがあるので）
  pattern.lastIndex = 0;
  var m;
  while ((m = pattern.exec(html)) !== null) {
    var href = m[1];
    // 相対URLを絶対URLに変換
    if (!base.test(href)) {
      var origin = baseUrl.match(/^(https?:\/\/[^\/]+)/)[1];
      href = href.charAt(0) === '/' ? origin + href : baseUrl.replace(/\/[^\/]*$/, '/') + href;
    }
    if (urls.indexOf(href) === -1) urls.push(href);
  }
  return urls;
}

// ===== ダウンロード＆アップロード =====

function downloadAndUpload(pdfUrl, folder) {
  var filename = decodeURIComponent(pdfUrl.split('/').pop()) || 'newsletter.pdf';
  try {
    var options = buildFetchOptions('GET', null);
    var resp = UrlFetchApp.fetch(pdfUrl, options);
    var code = resp.getResponseCode();
    if (code !== 200) {
      return { success: false, filename: filename, error: 'HTTP ' + code };
    }
    var blob = resp.getBlob().setName(filename);
    var sizeBytes = blob.getBytes().length;
    var sizeLabel = sizeBytes > 1048576
      ? (sizeBytes / 1048576).toFixed(1) + 'MB'
      : (sizeBytes / 1024).toFixed(0) + 'KB';

    // 既存ファイルがある場合はスキップ
    var existing = folder.getFilesByName(filename);
    if (existing.hasNext()) {
      var f = existing.next();
      Logger.log('  → 既存ファイルをスキップ: ' + filename);
      return { success: true, filename: filename, driveUrl: f.getUrl(), sizeLabel: sizeLabel };
    }

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { success: true, filename: filename, driveUrl: file.getUrl(), sizeLabel: sizeLabel };
  } catch (e) {
    return { success: false, filename: filename, error: String(e) };
  }
}
