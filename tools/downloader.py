"""
批量下载器
功能：批量下载文件/图片，支持并发下载
"""

import os
import sys
import argparse
import time
from urllib.parse import unquote, urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
except ImportError:
    print("请先安装依赖: pip install requests")
    sys.exit(1)


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def download_file(url, output_dir, timeout=30):
    """下载单个文件"""
    try:
        filename = unquote(urlparse(url).path.split("/")[-1])
        if not filename:
            filename = "download"

        output_path = os.path.join(output_dir, filename)

        resp = requests.get(url, headers=HEADERS, timeout=timeout, stream=True)
        resp.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        size = os.path.getsize(output_path)
        return {"url": url, "file": filename, "size": size, "status": "ok"}

    except Exception as e:
        return {"url": url, "file": "", "size": 0, "status": f"error: {e}"}


def batch_download(urls, output_dir, max_workers=5, timeout=30):
    """批量下载文件"""
    os.makedirs(output_dir, exist_ok=True)

    print(f"📥 开始下载 {len(urls)} 个文件 (并发: {max_workers})\n")

    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(download_file, url, output_dir, timeout): url
            for url in urls
        }

        for future in as_completed(futures):
            result = future.result()
            results.append(result)

            if result["status"] == "ok":
                size_kb = result["size"] / 1024
                print(f"  ✓ {result['file']} ({size_kb:.1f} KB)")
            else:
                print(f"  ✗ {result['url']}: {result['status']}")

    # 统计
    success = sum(1 for r in results if r["status"] == "ok")
    total_size = sum(r["size"] for r in results)

    print(f"\n📊 下载完成:")
    print(f"   成功: {success}/{len(urls)}")
    print(f"   总大小: {total_size / 1024 / 1024:.2f} MB")


def download_from_file(url_file, output_dir, max_workers=5):
    """从文件读取 URL 列表并下载"""
    with open(url_file, "r", encoding="utf-8") as f:
        urls = [line.strip() for line in f if line.strip() and not line.startswith("#")]

    batch_download(urls, output_dir, max_workers)


def download_images_from_page(url, output_dir):
    """下载网页中的所有图片"""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("请先安装依赖: pip install beautifulsoup4 lxml")
        sys.exit(1)

    from urllib.parse import urljoin

    resp = requests.get(url, headers=HEADERS, timeout=15)
    soup = BeautifulSoup(resp.text, "lxml")

    img_urls = []
    for img in soup.find_all("img", src=True):
        img_url = urljoin(url, img["src"])
        if img_url.startswith("http"):
            img_urls.append(img_url)

    print(f"🖼️ 找到 {len(img_urls)} 张图片")
    batch_download(img_urls, output_dir)


def main():
    parser = argparse.ArgumentParser(description="批量下载器")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 批量下载
    batch_parser = subparsers.add_parser("batch", help="批量下载")
    batch_parser.add_argument("--urls", nargs="+", required=True, help="URL 列表")
    batch_parser.add_argument("--output", required=True, help="输出目录")
    batch_parser.add_argument("--workers", type=int, default=5, help="并发数")

    # 从文件下载
    file_parser = subparsers.add_parser("from-file", help="从文件读取 URL 下载")
    file_parser.add_argument("--url-file", required=True, help="URL 列表文件")
    file_parser.add_argument("--output", required=True, help="输出目录")
    file_parser.add_argument("--workers", type=int, default=5)

    # 下载网页图片
    img_parser = subparsers.add_parser("images", help="下载网页图片")
    img_parser.add_argument("--url", required=True, help="网页 URL")
    img_parser.add_argument("--output", required=True, help="输出目录")

    args = parser.parse_args()

    if args.command == "batch":
        batch_download(args.urls, args.output, args.workers)
    elif args.command == "from-file":
        download_from_file(args.url_file, args.output, args.workers)
    elif args.command == "images":
        download_images_from_page(args.url, args.output)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
