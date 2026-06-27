"""
网页数据抓取工具
功能：抓取网页表格、列表、文章内容，保存为 CSV/JSON/TXT
"""

import os
import sys
import csv
import json
import argparse
import time
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("请先安装依赖: pip install requests beautifulsoup4 lxml")
    sys.exit(1)


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def fetch_page(url, encoding=None):
    """获取网页内容"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if encoding:
            resp.encoding = encoding
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        print(f"✗ 请求失败: {e}")
        return None


def scrape_table(url, encoding=None):
    """抓取网页中的所有表格"""
    html = fetch_page(url, encoding)
    if not html:
        return []

    soup = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")
    results = []

    for i, table in enumerate(tables):
        rows = []
        for tr in table.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
            if cells:
                rows.append(cells)
        if rows:
            results.append({"table_index": i + 1, "rows": rows})
            print(f"  ✓ 表格 {i + 1}: {len(rows)} 行 × {len(rows[0])} 列")

    return results


def scrape_list(url, selector, encoding=None):
    """抓取网页中的列表元素"""
    html = fetch_page(url, encoding)
    if not html:
        return []

    soup = BeautifulSoup(html, "lxml")
    items = soup.select(selector)
    results = [item.get_text(strip=True) for item in items]
    print(f"  ✓ 找到 {len(results)} 个元素")
    return results


def scrape_article(url, encoding=None):
    """抓取网页文章内容"""
    html = fetch_page(url, encoding)
    if not html:
        return None

    soup = BeautifulSoup(html, "lxml")

    # 移除 script 和 style
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    title = ""
    if soup.title:
        title = soup.title.get_text(strip=True)

    # 尝试找文章主体
    article = (
        soup.find("article")
        or soup.find("main")
        or soup.find("div", class_="content")
        or soup.find("div", id="content")
        or soup.body
    )

    if article:
        paragraphs = article.find_all("p")
        content = "\n\n".join(p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True))
    else:
        content = soup.get_text(separator="\n", strip=True)

    return {"title": title, "content": content}


def scrape_links(url, encoding=None):
    """抓取网页中的所有链接"""
    html = fetch_page(url, encoding)
    if not html:
        return []

    soup = BeautifulSoup(html, "lxml")
    links = []
    for a in soup.find_all("a", href=True):
        href = urljoin(url, a["href"])
        text = a.get_text(strip=True)
        if text and href.startswith("http"):
            links.append({"text": text, "url": href})

    print(f"  ✓ 找到 {len(links)} 个链接")
    return links


def save_csv(data, output_file):
    """保存为 CSV"""
    if not data:
        print("✗ 无数据可保存")
        return

    if isinstance(data[0], dict):
        keys = data[0].keys()
        with open(output_file, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(data)
    else:
        with open(output_file, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            for row in data:
                writer.writerow(row if isinstance(row, list) else [row])

    print(f"✅ 已保存: {output_file}")


def save_json(data, output_file):
    """保存为 JSON"""
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ 已保存: {output_file}")


def save_txt(text, output_file):
    """保存为 TXT"""
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"✅ 已保存: {output_file}")


def main():
    parser = argparse.ArgumentParser(description="网页数据抓取工具")
    parser.add_argument("--url", required=True, help="目标网址")
    parser.add_argument("--mode", choices=["table", "list", "article", "links"],
                        default="article", help="抓取模式")
    parser.add_argument("--selector", help="CSS 选择器 (list 模式必填)")
    parser.add_argument("--output", default="output", help="输出文件名 (不含扩展名)")
    parser.add_argument("--format", choices=["csv", "json", "txt"], default="csv")
    parser.add_argument("--encoding", help="网页编码 (如 gbk, utf-8)")

    args = parser.parse_args()

    print(f"🔍 正在抓取: {args.url}")
    print(f"   模式: {args.mode}\n")

    if args.mode == "table":
        data = scrape_table(args.url, args.encoding)
        if data:
            flat_rows = []
            for table in data:
                for row in table["rows"]:
                    flat_rows.append(row)
            if args.format == "csv":
                save_csv(flat_rows, f"{args.output}.csv")
            else:
                save_json(data, f"{args.output}.json")

    elif args.mode == "list":
        if not args.selector:
            print("✗ list 模式需要 --selector 参数")
            sys.exit(1)
        data = scrape_list(args.url, args.selector, args.encoding)
        if data:
            if args.format == "csv":
                save_csv(data, f"{args.output}.csv")
            else:
                save_json(data, f"{args.output}.json")

    elif args.mode == "article":
        data = scrape_article(args.url, args.encoding)
        if data:
            print(f"  ✓ 标题: {data['title']}")
            print(f"  ✓ 正文: {len(data['content'])} 字")
            text = f"标题: {data['title']}\n\n{data['content']}"
            save_txt(text, f"{args.output}.txt")

    elif args.mode == "links":
        data = scrape_links(args.url, args.encoding)
        if data:
            if args.format == "csv":
                save_csv(data, f"{args.output}.csv")
            else:
                save_json(data, f"{args.output}.json")


if __name__ == "__main__":
    main()
