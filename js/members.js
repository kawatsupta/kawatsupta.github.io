/**
 * 会員専用ページ 復号・表示ロジック
 *
 * セキュリティ設計:
 * - このファイルにパスワードは一切書かれていない
 * - ユーザーが入力したパスワードが復号キー（SHA-256）になる
 * - 復号結果が valid JSON かどうかで認証チェックを兼ねる
 */

// ===== セクション設定（URL パラメータ ?section=sports|newsletter）=====

var SECTION_CONFIG = {
  sports:     { title: 'スポ少情報' },
  newsletter: { title: '広報誌「らくざん」バックナンバー' }
};

function getCurrentSection() {
  return new URLSearchParams(location.search).get('section') || null;
}

// ===== localStorage キー =====
var STORAGE_KEY      = 'members_pw';
var FAIL_KEY         = 'members_fails';
var MAX_FAILS        = 5;
var LOCKOUT_MS       = 5 * 60 * 1000; // 5分

// ===== ロックアウト管理 =====

function getFailState() {
  try { return JSON.parse(localStorage.getItem(FAIL_KEY)) || { count: 0, lockedAt: null }; }
  catch (e) { return { count: 0, lockedAt: null }; }
}

function isLockedOut() {
  var s = getFailState();
  if (s.count < MAX_FAILS) return false;
  return s.lockedAt && (Date.now() - s.lockedAt) < LOCKOUT_MS;
}

function remainingSeconds() {
  var s = getFailState();
  if (!s.lockedAt) return 0;
  return Math.ceil((LOCKOUT_MS - (Date.now() - s.lockedAt)) / 1000);
}

function recordFailure() {
  var s = getFailState();
  s.count += 1;
  if (s.count >= MAX_FAILS) s.lockedAt = Date.now();
  localStorage.setItem(FAIL_KEY, JSON.stringify(s));
}

function clearFailState() {
  localStorage.removeItem(FAIL_KEY);
}

// DOMContentLoaded: Enter キー対応 + ページタイトル初期化 + 自動ログイン
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('member-pw').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') memberLogin();
  });
  document.getElementById('member-id').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('member-pw').focus();
  });

  // URL パラメータに応じてページタイトルを変更（ログイン前から）
  var section = getCurrentSection();
  if (section && SECTION_CONFIG[section]) {
    var label = '| ' + SECTION_CONFIG[section].title;
    document.getElementById('page-title').textContent = label;
    document.title = SECTION_CONFIG[section].title + ' | 川津小学校PTA';
  }

  // 保存済みパスワードがあれば自動ログイン
  var savedPw = localStorage.getItem(STORAGE_KEY);
  if (savedPw) {
    document.getElementById('member-id').value = 'PTA';
    document.getElementById('member-pw').value = savedPw;
    memberLogin();
  }
});

// ===== 暗号化ユーティリティ（XOR + SHA-256 キー）=====

async function getKey(password) {
  const data = new TextEncoder().encode(password);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

async function decrypt(base64, password) {
  const key = await getKey(password);
  const bytes = Uint8Array.from(atob(base64), function (c) { return c.charCodeAt(0); });
  const plain = bytes.map(function (b, i) { return b ^ key[i % 32]; });
  return new TextDecoder().decode(plain);
}

// ===== ログイン処理 =====

async function memberLogin() {
  // ロックアウト中チェック
  if (isLockedOut()) {
    var sec = remainingSeconds();
    var min = Math.ceil(sec / 60);
    showLoginError('入力誤りが続いたため、あと約' + min + '分後に再試行できます');
    return;
  }

  var id = document.getElementById('member-id').value.trim();
  var pw = document.getElementById('member-pw').value.trim();
  var btn = document.getElementById('login-btn');

  // ID チェック（非秘密な識別子）
  if (id !== 'PTA') {
    recordFailure();
    showLoginError(loginErrorMessage());
    return;
  }

  if (!pw) {
    showLoginError('パスワードを入力してください');
    return;
  }

  btn.disabled = true;
  btn.textContent = '確認中...';
  hideLoginError();

  try {
    // 暗号化データを取得（MEMBERS_DATA_URL は members.html で Jekyll が生成）
    var dataUrl = typeof MEMBERS_DATA_URL !== 'undefined'
      ? MEMBERS_DATA_URL
      : '/data/members.json';
    var resp = await fetch(dataUrl);

    if (!resp.ok) throw new Error('データ取得失敗: ' + resp.status);

    var json = await resp.json();

    // データ未設定の場合
    if (!json.data) {
      localStorage.setItem(STORAGE_KEY, pw);
      showContent({ sports_clubs: [], newsletters: [] });
      return;
    }

    // 復号を試みる（失敗 = パスワード間違い）
    var plain;
    try {
      plain = await decrypt(json.data, pw);
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY); // 保存済みが無効なら削除
      recordFailure();
      showLoginArea();
      showLoginError(loginErrorMessage());
      return;
    }

    // valid JSON かチェック（= パスワード正否の判定）
    var content;
    try {
      content = JSON.parse(plain);
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY); // 保存済みが無効なら削除
      recordFailure();
      showLoginArea();
      showLoginError(loginErrorMessage());
      return;
    }

    // 認証成功 → 失敗カウントをリセットしてパスワードを保存してコンテンツ表示
    clearFailState();
    localStorage.setItem(STORAGE_KEY, pw);
    showContent(content);

  } catch (e) {
    showLoginArea();
    showLoginError('エラーが発生しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ログイン';
  }
}

// ===== フラッシュ防止スタイルを除去してログインフォームを表示 =====

function showLoginArea() {
  var style = document.getElementById('auto-login-style');
  if (style) style.remove();
  document.getElementById('login-area').style.display = 'block';
}

// ===== ログアウト処理 =====

function memberLogout() {
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById('member-pw').value = '';
  document.getElementById('members-content').style.display = 'none';
  document.getElementById('login-area').style.display = 'block';
}

// ===== コンテンツ表示 =====

function showContent(content) {
  document.getElementById('login-area').style.display = 'none';
  document.getElementById('members-content').style.display = 'block';

  var hasContent = false;

  // スポ少情報
  if (content.sports_clubs && content.sports_clubs.length > 0) {
    var tbody = document.getElementById('sports-tbody');
    tbody.innerHTML = '';
    content.sports_clubs.forEach(function (club, idx) {
      var tr = document.createElement('tr');
      tr.style.background = idx % 2 === 0 ? '#f9f9f9' : '#fff';
      tr.innerHTML =
        '<td style="padding:10px 8px; border-bottom:1px solid #eee;">' + esc(club.name) + '</td>' +
        '<td style="padding:10px 8px; border-bottom:1px solid #eee; white-space:pre-wrap;">' + esc(club.days) + '</td>' +
        '<td style="padding:10px 8px; border-bottom:1px solid #eee; white-space:nowrap;">' + esc(club.grades) + '</td>' +
        '<td style="padding:10px 8px; border-bottom:1px solid #eee; white-space:nowrap;">' + esc(club.contact) + '</td>';
      tbody.appendChild(tr);
    });
    document.getElementById('section-sports').style.display = 'block';
    hasContent = true;
  }

  // 広報誌バックナンバー
  if (content.newsletters && content.newsletters.length > 0) {
    var ul = document.getElementById('newsletter-list');
    ul.innerHTML = '';
    content.newsletters.forEach(function (item, idx) {
      var li = document.createElement('li');
      li.innerHTML =
        '<a href="' + esc(item.url) + '">' +
          esc(item.label) + '：<span style="text-decoration:underline;">ＰＤＦファイル</span>' +
          (item.size ? '　（File Size ' + esc(item.size) + '）' : '') +
          (idx === 0 ? '　<span style="background:#e00;color:#fff;font-size:0.75em;padding:2px 6px;border-radius:2px;vertical-align:middle;">NEW</span>' : '') +
        '</a>';
      ul.appendChild(li);
    });
    document.getElementById('section-newsletter').style.display = 'block';
    hasContent = true;
  }

  if (!hasContent) {
    document.getElementById('section-empty').style.display = 'block';
  }

  // セクションフィルタ: ?section=sports → 広報誌を非表示、?section=newsletter → スポ少を非表示
  var section = getCurrentSection();
  if (section === 'sports') {
    document.getElementById('section-newsletter').style.display = 'none';
  } else if (section === 'newsletter') {
    document.getElementById('section-sports').style.display = 'none';
  }
}

// ===== ヘルパー =====

function loginErrorMessage() {
  if (isLockedOut()) {
    var min = Math.ceil(remainingSeconds() / 60);
    return '入力誤りが続いたため、あと約' + min + '分後に再試行できます';
  }
  var s = getFailState();
  var left = MAX_FAILS - s.count;
  if (left > 0 && left <= 2) {
    return 'IDまたはパスワードが違います（あと' + left + '回誤ると一時ロックされます）';
  }
  return 'IDまたはパスワードが違います';
}

function showLoginError(msg) {
  var el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideLoginError() {
  document.getElementById('login-error').style.display = 'none';
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
