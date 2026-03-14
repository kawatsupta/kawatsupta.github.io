#!/usr/bin/env python3
"""
マイグレーションツール: 旧PTA サイトの「お知らせ」記事を
Jekyll _posts/ 形式に変換して GitHub に push する。

使い方:
  python migrate.py --dry-run              # 確認のみ（GitHub へのpush なし）
  python migrate.py                        # 本番実行（全件）
  python migrate.py --from 20240101        # 2024年以降のみ
  python migrate.py --from 20240101 --to 20241231  # 期間指定
"""

import re
import sys
import time
import base64
import argparse
import requests
from bs4 import BeautifulSoup, NavigableString, Tag

import config

BASE_URL    = 'http://kawatsupta.byonia.net'
LISTING_URL = BASE_URL + '/event.html'
SLEEP_SEC   = 1.0  # GitHub API レート制限対策（push1件ごと）


# ──────────────────────────────────────────────────────────────────────────────
# スクレイピング
# ──────────────────────────────────────────────────────────────────────────────

def fetch_soup(url):
    """URL を取得して BeautifulSoup を返す"""
    resp = requests.get(url, timeout=15)
    resp.encoding = resp.apparent_encoding or 'utf-8'
    return BeautifulSoup(resp.text, 'html.parser')


def get_article_urls():
    """event.html から記事URL一覧を取得して古い順で返す"""
    soup = fetch_soup(LISTING_URL)
    seen, urls = set(), []
    for a in soup.find_all('a', href=True):
        href = a['href']
        if re.match(r'^report/\d{8}\.html$', href):
            url = BASE_URL + '/' + href
            if url not in seen:
                seen.add(url)
                urls.append(url)
    # 日付順（古い順）でソート
    urls.sort(key=lambda u: re.search(r'/(\d{8})\.html$', u).group(1))
    return urls


def parse_article(url):
    """
    記事ページをパースして辞書を返す。失敗時は None。

    返り値:
      { date, date_raw, title, body, images, url }
    """
    m = re.search(r'/(\d{8})\.html$', url)
    if not m:
        return None
    date_raw = m.group(1)
    date     = f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:8]}"

    soup = fetch_soup(url)

    # タイトル: <h2> から取得
    h2    = soup.find('h2')
    title = h2.get_text(strip=True) if h2 else '（タイトル不明）'

    # 本文 <p> タグ群: #main > section 内
    main_div = soup.find(id='main')
    section  = main_div.find('section') if main_div else None
    p_list   = section.find_all('p') if section else soup.find_all('p')

    text_buf = ''
    images   = []

    for p in p_list:
        for child in p.children:
            if isinstance(child, NavigableString):
                text_buf += str(child)
            elif isinstance(child, Tag):
                if child.name == 'br':
                    text_buf += '\n'
                elif child.name == 'img':
                    src = child.get('src', '').strip()
                    if src:
                        if not src.startswith('http'):
                            # 相対パス → 絶対URL（記事と同ディレクトリ）
                            src = BASE_URL + '/report/' + src
                        images.append(src)
                else:
                    # <a> 等はテキストのみ取り出す
                    text_buf += child.get_text()

    # テキスト後処理
    # ・連続3改行以上 → 段落区切り（\n\n）
    text_buf = re.sub(r' *\n *\n *\n+', '\n\n', text_buf)
    text_buf = re.sub(r' *\n *\n *',    '\n\n', text_buf)
    # ・行末スペース除去
    text_buf = '\n'.join(line.rstrip() for line in text_buf.split('\n')).strip()

    return {
        'date':     date,
        'date_raw': date_raw,
        'title':    title,
        'body':     text_buf,
        'images':   images,
        'url':      url,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Markdown 生成
# ──────────────────────────────────────────────────────────────────────────────

def build_markdown(article):
    """記事データから Jekyll Markdown 文字列を生成する"""
    title  = article['title'].replace('\\', '\\\\').replace('"', '\\"')
    date   = article['date']
    body   = article['body']
    images = article['images']

    # Jekyll frontmatter
    md = (
        '---\n'
        f'title: "{title}"\n'
        f'date: {date}\n'
        'layout: post\n'
        'migrated: true\n'
        '---\n\n'
    )

    # 本文
    if body:
        md += body + '\n\n'

    # 画像（1枚: Markdown記法 / 複数: photo-grid）
    if len(images) == 1:
        md += f'![]({images[0]})\n'
    elif len(images) > 1:
        img_tags = '\n'.join(
            f'<img src="{src}" alt="写真">'
            for src in images
        )
        md += f'<div class="photo-grid">\n{img_tags}\n</div>\n'

    return md


# ──────────────────────────────────────────────────────────────────────────────
# GitHub push
# ──────────────────────────────────────────────────────────────────────────────

def push_to_github(filepath, content, commit_message):
    """GitHub API でファイルを作成または更新する。成功時 True"""
    api_url = (
        f'https://api.github.com/repos/{config.GITHUB_OWNER}/{config.GITHUB_REPO}'
        f'/contents/{filepath}'
    )
    headers = {
        'Authorization': f'token {config.GITHUB_TOKEN}',
        'Content-Type':  'application/json',
    }

    # 既存ファイルの sha 取得（上書き更新時に必要）
    get_resp = requests.get(api_url, headers=headers,
                            params={'ref': config.GITHUB_BRANCH})
    sha = get_resp.json().get('sha') if get_resp.status_code == 200 else None

    payload = {
        'message': commit_message,
        'content': base64.b64encode(content.encode('utf-8')).decode('ascii'),
        'branch':  config.GITHUB_BRANCH,
    }
    if sha:
        payload['sha'] = sha

    put_resp = requests.put(api_url, headers=headers, json=payload)
    return put_resp.status_code in (200, 201)


# ──────────────────────────────────────────────────────────────────────────────
# メイン
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='PTA 旧サイト「お知らせ」記事を GitHub Pages へ移行する'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='スクレイピング・変換のみ実行。GitHub への push はスキップ'
    )
    parser.add_argument(
        '--from', dest='from_date', metavar='YYYYMMDD',
        help='移行開始日（この日付以降を対象）'
    )
    parser.add_argument(
        '--to', dest='to_date', metavar='YYYYMMDD',
        help='移行終了日（この日付以前を対象）'
    )
    args = parser.parse_args()

    print('記事URL一覧を取得中...')
    urls = get_article_urls()
    print(f'{len(urls)} 件の記事URLを取得しました')

    # 日付フィルター
    if args.from_date or args.to_date:
        def in_range(url):
            m = re.search(r'/(\d{8})\.html$', url)
            d = m.group(1) if m else '00000000'
            if args.from_date and d < args.from_date:
                return False
            if args.to_date and d > args.to_date:
                return False
            return True
        urls = [u for u in urls if in_range(u)]
        print(f'フィルター後: {len(urls)} 件')

    if args.dry_run:
        print('[DRY RUN モード] GitHub への push はスキップします\n')

    success, failed = 0, 0
    errors = []

    for i, url in enumerate(urls, 1):
        m = re.search(r'/(\d{8})\.html$', url)
        date_str = m.group(1) if m else '?'
        label = f'[{i:3d}/{len(urls)}] {date_str}'

        try:
            article = parse_article(url)
            if not article:
                print(f'{label} → スキップ（パース失敗）')
                failed += 1
                continue

            markdown  = build_markdown(article)
            filename  = f"{article['date']}-migrated-{article['date_raw']}.md"
            filepath  = f'_posts/{filename}'

            if args.dry_run:
                preview   = article['title'][:40]
                img_count = len(article['images'])
                print(f'{label} → {preview}  （画像 {img_count} 枚）')
                success += 1
            else:
                commit_msg = f'[migrate] {article["title"]}'
                ok = push_to_github(filepath, markdown, commit_msg)
                if ok:
                    print(f'{label} → OK  {article["title"][:35]}')
                    success += 1
                else:
                    print(f'{label} → FAILED')
                    failed += 1
                    errors.append(f'{date_str}: push 失敗')
                time.sleep(SLEEP_SEC)

        except Exception as e:
            print(f'{label} → ERROR: {e}')
            failed += 1
            errors.append(f'{date_str}: {e}')

    print(f'\n{"=" * 40}')
    print(f'完了: {success} 件成功, {failed} 件失敗')
    if errors:
        print('\nエラー詳細:')
        for err in errors:
            print(f'  {err}')


if __name__ == '__main__':
    main()
