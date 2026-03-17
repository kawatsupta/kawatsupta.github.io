#!/usr/bin/env python3
"""
広報誌PDFを旧サイトからローカルにダウンロードする移行ツール。

【フロー】
  1. 旧サイトの広報誌一覧ページ（要認証）にアクセス
  2. PDFリンクを一覧取得
  3. 各PDFをローカルの出力ディレクトリにダウンロード
     - 10分間隔でダウンロード（レート制限対策）
     - 取得済みファイルはスキップ（再実行に対応）
  4. 完了後に members.json 更新用の URL リストを出力

【使い方】
  python migrate_newsletters.py --dry-run   # 確認のみ（DL なし）
  python migrate_newsletters.py             # 全件実行
  python migrate_newsletters.py --limit 3  # 最大3件だけ試す

【設定】
  tools/newsletter_config.py.example を newsletter_config.py にコピーして
  URL・認証情報を設定してください。
  ※ newsletter_config.py は .gitignore 対象です。
"""

import os
import re
import sys
import time
import argparse
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

try:
    import newsletter_config as config
except ImportError:
    print('エラー: newsletter_config.py が見つかりません。')
    print('  newsletter_config.py.example をコピーして設定してください。')
    sys.exit(1)

for _attr in ('LIST_URL', 'AUTH_USER', 'AUTH_PASS', 'OUTPUT_DIR'):
    if not hasattr(config, _attr):
        print(f'エラー: newsletter_config.py に {_attr} が設定されていません。')
        sys.exit(1)

# ──────────────────────────────────────────────────────────────────────────────
# 定数
# ──────────────────────────────────────────────────────────────────────────────

DOWNLOAD_INTERVAL = 600  # ファイル間の待機秒数（10分）
RETRY_WAITS       = [30, 60]  # 503時のリトライ待機秒数
REQUEST_TIMEOUT   = 30


# ──────────────────────────────────────────────────────────────────────────────
# HTTP ヘルパー
# ──────────────────────────────────────────────────────────────────────────────

def _session():
    """認証設定済みセッションを返す"""
    s = requests.Session()
    if config.AUTH_USER:
        s.auth = (config.AUTH_USER, config.AUTH_PASS)
    return s


def fetch_page(url, session):
    """ページを取得して BeautifulSoup を返す。失敗時は None。"""
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT)
        if resp.status_code == 401:
            print(f'認証エラー（401）: IDとパスワードを確認してください。')
            return None
        if resp.status_code != 200:
            print(f'HTTP {resp.status_code}: {url}')
            return None
        resp.encoding = resp.apparent_encoding or 'utf-8'
        return BeautifulSoup(resp.text, 'html.parser')
    except Exception as e:
        print(f'ページ取得エラー: {e}')
        return None


def download_pdf(url, session):
    """
    PDFをダウンロードして bytes を返す。
    503（レートリミット）は RETRY_WAITS に従ってリトライ。
    失敗時は None。
    """
    for attempt, wait in enumerate([0] + RETRY_WAITS):
        if wait:
            print(f'  ⚠ 503 レートリミット。{wait}秒後にリトライ ({attempt}/{len(RETRY_WAITS)+1})…')
            time.sleep(wait)
        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT)
        except Exception as e:
            print(f'  ✗ DL例外: {e}')
            return None
        if resp.status_code == 200:
            return resp.content
        if resp.status_code != 503:
            print(f'  ✗ DL失敗: HTTP {resp.status_code}')
            return None

    print(f'  ✗ リトライ上限到達: {url}')
    return None


# ──────────────────────────────────────────────────────────────────────────────
# PDF リンク抽出
# ──────────────────────────────────────────────────────────────────────────────

def extract_pdf_links(soup, base_url):
    """
    BeautifulSoup からPDFリンクを抽出して (filename, absolute_url) リストを返す。
    重複除去・出現順を保持。
    """
    seen, results = set(), []
    for a in soup.find_all('a', href=True):
        href = a['href']
        if not href.lower().endswith('.pdf'):
            continue
        abs_url = urljoin(base_url, href)
        filename = os.path.basename(urlparse(abs_url).path)
        if not filename:
            filename = re.sub(r'[^\w.-]', '_', href)
        if abs_url not in seen:
            seen.add(abs_url)
            results.append((filename, abs_url))
    return results


# ──────────────────────────────────────────────────────────────────────────────
# メイン処理
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='旧サイトの広報誌PDFをローカルにダウンロードする'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='URLの確認のみ（ダウンロードしない）'
    )
    parser.add_argument(
        '--limit', type=int, metavar='N',
        help='最大N件だけダウンロードする（動作確認用）'
    )
    args = parser.parse_args()

    print('=== 広報誌移行ツール ===')
    print(f'一覧ページ: {config.LIST_URL}')
    print(f'出力先    : {config.OUTPUT_DIR}')
    if args.dry_run:
        print('[DRY RUN モード] ダウンロードはスキップします\n')
    else:
        print(f'ファイル間隔: {DOWNLOAD_INTERVAL // 60}分\n')

    session = _session()

    # 一覧ページ取得
    print('一覧ページを取得中...')
    soup = fetch_page(config.LIST_URL, session)
    if soup is None:
        print('一覧ページの取得に失敗しました。')
        sys.exit(1)

    # PDFリンク抽出
    pdfs = extract_pdf_links(soup, config.LIST_URL)
    if not pdfs:
        print('PDFリンクが見つかりませんでした。')
        print('ヒント: 認証が不要な別のURLを LIST_URL に設定するか、')
        print('       旧サイトのHTML構造に合わせて extract_pdf_links() を調整してください。')
        sys.exit(1)

    if args.limit:
        pdfs = pdfs[:args.limit]

    print(f'{len(pdfs)} 件のPDFを検出しました\n')

    # 出力ディレクトリ作成
    if not args.dry_run:
        os.makedirs(config.OUTPUT_DIR, exist_ok=True)

    ok_count = fail_count = skip_count = 0
    downloaded = []

    for i, (filename, url) in enumerate(pdfs, 1):
        label = f'[{i:3d}/{len(pdfs)}] {filename}'
        out_path = os.path.join(config.OUTPUT_DIR, filename)

        # ── dry-run ──
        if args.dry_run:
            print(f'{label}')
            print(f'        → {url}')
            ok_count += 1
            continue

        # ── スキップ（再実行対応）──
        if os.path.exists(out_path):
            size_kb = os.path.getsize(out_path) // 1024
            print(f'{label} → スキップ（取得済み {size_kb}KB）')
            skip_count += 1
            downloaded.append((filename, out_path))
            continue

        # ── ダウンロード ──
        print(f'{label} → ダウンロード中...')
        data = download_pdf(url, session)
        if data is None:
            fail_count += 1
            continue

        with open(out_path, 'wb') as f:
            f.write(data)
        size_kb = len(data) // 1024
        print(f'{label} → 完了 ({size_kb}KB)')
        ok_count += 1
        downloaded.append((filename, out_path))

        # ── 次のファイルまで待機（最後の1件は待機不要）──
        if i < len(pdfs):
            remaining = len(pdfs) - i
            print(f'  → {DOWNLOAD_INTERVAL // 60}分後に次のファイルを取得します... '
                  f'（残り {remaining} 件）')
            time.sleep(DOWNLOAD_INTERVAL)

    # ── サマリー ──
    print(f'\n{"=" * 50}')
    if args.dry_run:
        print(f'[DRY RUN] 対象ファイル: {ok_count} 件')
    else:
        print(f'完了: {ok_count} 件成功 / {skip_count} 件スキップ / {fail_count} 件失敗')
        print(f'保存先: {os.path.abspath(config.OUTPUT_DIR)}')

        if downloaded:
            print('\n【次のステップ】')
            print('1. 下記ファイルをGoogleドライブの広報誌フォルダにアップロード')
            print('2. 各ファイルの共有リンク（誰でも閲覧可）を取得')
            print('3. members.json の newsletters セクションに追記\n')
            print('ダウンロード済みファイル一覧:')
            for fname, path in downloaded:
                print(f'  {fname}')
