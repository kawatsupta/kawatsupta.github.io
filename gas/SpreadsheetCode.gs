/**
 * 川津小学校PTA スプレッドシート連携スクリプト
 *
 * 【このスクリプトの設定場所】
 * Google ドキュメントではなく、スプレッドシート（info）に設定します。
 * スプレッドシートを開いて「拡張機能」→「Apps Script」からこのファイルを貼り付けてください。
 *
 * 【初期設定（スクリプトプロパティに以下を設定）】
 * GITHUB_TOKEN    : GitHub Fine-grained Personal Access Token (Contents: Read and Write)
 * GITHUB_OWNER    : GitHub アカウント名 (例: n-nishizaki)
 * GITHUB_REPO     : リポジトリ名 (例: kawatsu-pta-web)
 * MEMBER_PASSWORD : 会員限定ページのパスワード（平文で設定。このプロパティはスクリプト管理者のみ閲覧可）
 */

// ===== メニューを追加 =====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PTA公開')
    .addItem('サイト情報を更新する（ご挨拶・役立ち情報・リンク集）', 'publishSiteInfo')
    .addSeparator()
    .addItem('会員限定ページを更新する（スポ少情報・広報誌）', 'publishMembersInfo')
    .addToUi();
}

// ===== サイト情報を更新（一般公開） =====
function publishSiteInfo() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    'サイト情報の更新',
    'このスプレッドシートの内容でご挨拶・役立ち情報・リンク集を更新します。\nよろしいですか？',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // --- ご挨拶 ---
    var greetingSheet = ss.getSheetByName('ご挨拶');
    var greetingText = String(greetingSheet.getRange('B1').getValue());
    var greetingJson = JSON.stringify({ text: greetingText });
    pushToGitHub('_data/greeting.json', greetingJson, 'ご挨拶を更新');

    // --- 役立ち情報 ---
    var infoSheet = ss.getSheetByName('役立ち情報');
    var infoRows = infoSheet.getDataRange().getValues();
    var links = infoRows
      .filter(function(row) { return String(row[0]).trim(); })
      .map(function(row) {
        var title = String(row[0]).trim();
        var membersOnly = title.indexOf('【会員限定】') >= 0;
        // 会員限定の場合: C列にURLが入っていればそれを使う。未入力なら /members/ にフォールバック
        var url = String(row[2] || '').trim();
        if (membersOnly && !url) url = '/kawatsu-pta-web/members/';
        return {
          name:         title.replace('【会員限定】', '').trim(),
          desc:         String(row[1] || '').trim(),
          url:          url,
          members_only: membersOnly
        };
      });

    // --- リンク集 ---
    var linkSheet = ss.getSheetByName('リンク集');
    var linkRows = linkSheet.getDataRange().getValues();
    var extLinks = linkRows
      .filter(function(row) { return String(row[0]).trim(); })
      .map(function(row) {
        return {
          name: String(row[0]).trim(),
          url:  String(row[1] || '#').trim()
        };
      });

    var infoJson = JSON.stringify({ links: links, ext_links: extLinks });
    pushToGitHub('_data/info.json', infoJson, '役立ち情報・リンク集を更新');

    ui.alert(
      '更新完了',
      'サイト情報を更新しました！\n数分後にサイトに反映されます。',
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('エラー', '更新に失敗しました。\n\nエラー内容:\n' + e.message, ui.ButtonSet.OK);
    console.error(e);
  }
}

// ===== 会員限定ページを更新（スポ少情報・広報誌） =====
function publishMembersInfo() {
  var ui = SpreadsheetApp.getUi();

  // パスワードをスクリプトプロパティから取得
  var props = PropertiesService.getScriptProperties();
  var memberPassword = props.getProperty('MEMBER_PASSWORD');
  if (!memberPassword) {
    ui.alert(
      '設定エラー',
      'スクリプトプロパティ「MEMBER_PASSWORD」が設定されていません。\n' +
      '「プロジェクトの設定」→「スクリプトのプロパティ」から設定してください。',
      ui.ButtonSet.OK
    );
    return;
  }

  var result = ui.alert(
    '会員限定ページの更新',
    'スポ少情報・広報誌の内容を暗号化してサイトに反映します。\nよろしいですか？',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // --- スポ少情報（A=クラブ名, B=活動時間, C=対象学年, D=連絡先）---
    var sportsSheet = ss.getSheetByName('スポ少情報');
    var sportsClubs = [];
    if (sportsSheet) {
      var sportsRows = sportsSheet.getDataRange().getValues();
      // 1行目がヘッダーの場合はスキップ
      var startRow = (String(sportsRows[0][0]).trim() === 'クラブ名') ? 1 : 0;
      for (var i = startRow; i < sportsRows.length; i++) {
        var row = sportsRows[i];
        if (!String(row[0]).trim()) continue;
        sportsClubs.push({
          name:    String(row[0] || '').trim(),
          days:    String(row[1] || '').trim(),
          grades:  String(row[2] || '').trim(),
          contact: String(row[3] || '').trim()
        });
      }
    }

    // --- 広報誌（A=号数ラベル, B=Google Drive URL, C=ファイルサイズ）---
    var newsletterSheet = ss.getSheetByName('広報誌');
    var newsletters = [];
    if (newsletterSheet) {
      var newsletterRows = newsletterSheet.getDataRange().getValues();
      var nlStartRow = (String(newsletterRows[0][0]).trim() === '号数') ? 1 : 0;
      for (var j = nlStartRow; j < newsletterRows.length; j++) {
        var nlRow = newsletterRows[j];
        if (!String(nlRow[0]).trim()) continue;
        newsletters.push({
          label: String(nlRow[0] || '').trim(),
          url:   String(nlRow[1] || '').trim(),
          size:  String(nlRow[2] || '').trim()
        });
      }
    }

    // --- JSON 組み立て → 暗号化 → push ---
    var plainJson = JSON.stringify({
      sports_clubs: sportsClubs,
      newsletters:  newsletters
    });

    var encrypted = encryptXOR(plainJson, memberPassword);
    var membersJson = JSON.stringify({ data: encrypted });

    pushToGitHub('data/members.json', membersJson, '会員限定ページを更新');

    ui.alert(
      '更新完了',
      '会員限定ページを更新しました！\n数分後にサイトに反映されます。\n\n' +
      '・スポ少情報: ' + sportsClubs.length + ' クラブ\n' +
      '・広報誌: ' + newsletters.length + ' 件',
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('エラー', '更新に失敗しました。\n\nエラー内容:\n' + e.message, ui.ButtonSet.OK);
    console.error(e);
  }
}

// ===== XOR 暗号化（SHA-256 をキーとして使用）=====
// ブラウザ側の js/members.js と同じアルゴリズム
function encryptXOR(plainText, password) {
  // SHA-256(password) を 32 バイトのキーとして使う
  var keyBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );
  // GAS の computeDigest は signed byte（-128〜127）を返すので unsigned に変換
  keyBytes = keyBytes.map(function(b) { return b < 0 ? b + 256 : b; });

  var textBytes = Utilities.newBlob(plainText, 'UTF-8').getBytes();
  textBytes = textBytes.map(function(b) { return b < 0 ? b + 256 : b; });

  var result = textBytes.map(function(b, i) {
    return b ^ keyBytes[i % 32];
  });

  return Utilities.base64Encode(result);
}

// ===== GitHub API でファイルを作成・更新 =====
function pushToGitHub(filepath, content, commitMessage) {
  var props = PropertiesService.getScriptProperties();
  var owner = props.getProperty('GITHUB_OWNER');
  var repo  = props.getProperty('GITHUB_REPO');
  var token = props.getProperty('GITHUB_TOKEN');

  if (!owner || !repo || !token) {
    throw new Error(
      'スクリプトプロパティが設定されていません。\n' +
      'GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO を設定してください。'
    );
  }

  var apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filepath;

  // 既存ファイルの SHA を取得（更新時に必要）
  var sha;
  var getRes = UrlFetchApp.fetch(apiUrl, {
    headers: { 'Authorization': 'token ' + token },
    muteHttpExceptions: true
  });
  if (getRes.getResponseCode() === 200) {
    sha = JSON.parse(getRes.getContentText()).sha;
  }

  // ファイルを作成または更新
  var payload = {
    message: commitMessage,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: 'main'
  };
  if (sha) payload.sha = sha;

  var putRes = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: {
      'Authorization': 'token ' + token,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = putRes.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub API エラー: HTTP ' + code + '\n' + putRes.getContentText());
  }
}
