"""
PDF 批处理工具
功能：合并、拆分、提取页面、添加水印、PDF 转图片
"""

import os
import sys
import argparse
from pathlib import Path

try:
    from PyPDF2 import PdfReader, PdfWriter, PdfMerger
except ImportError:
    print("请先安装依赖: pip install PyPDF2")
    sys.exit(1)


def merge_pdfs(input_files, output_file):
    """合并多个 PDF 文件"""
    merger = PdfMerger()
    for f in input_files:
        if os.path.exists(f):
            merger.append(f)
            print(f"  ✓ 已添加: {f}")
        else:
            print(f"  ✗ 文件不存在: {f}")
    merger.write(output_file)
    merger.close()
    print(f"\n✅ 合并完成: {output_file}")


def split_pdf(input_file, output_dir, pages_per_file=1):
    """拆分 PDF 文件"""
    reader = PdfReader(input_file)
    total_pages = len(reader.pages)
    os.makedirs(output_dir, exist_ok=True)
    base_name = Path(input_file).stem

    for i in range(0, total_pages, pages_per_file):
        writer = PdfWriter()
        end = min(i + pages_per_file, total_pages)
        for j in range(i, end):
            writer.add_page(reader.pages[j])
        output_path = os.path.join(output_dir, f"{base_name}_第{i+1}-{end}页.pdf")
        with open(output_path, "wb") as f:
            writer.write(f)
        print(f"  ✓ 已拆分: {output_path}")

    print(f"\n✅ 拆分完成，共 {total_pages} 页")


def extract_pages(input_file, pages, output_file):
    """提取指定页面 (pages 格式: "1,3,5-8")"""
    reader = PdfReader(input_file)
    writer = PdfWriter()

    page_list = parse_page_range(pages, len(reader.pages))
    for p in page_list:
        writer.add_page(reader.pages[p - 1])

    with open(output_file, "wb") as f:
        writer.write(f)
    print(f"✅ 已提取 {len(page_list)} 页到: {output_file}")


def parse_page_range(page_str, total_pages):
    """解析页码范围字符串，如 '1,3,5-8'"""
    pages = []
    for part in page_str.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-", 1)
            start, end = int(start), int(end)
            pages.extend(range(start, min(end, total_pages) + 1))
        else:
            p = int(part)
            if 1 <= p <= total_pages:
                pages.append(p)
    return sorted(set(pages))


def pdf_to_images(input_file, output_dir, fmt="png", dpi=200):
    """PDF 转图片"""
    try:
        from pdf2image import convert_from_path
    except ImportError:
        print("请先安装依赖: pip install pdf2image")
        print("还需要安装 poppler: https://github.com/osber/poppler-windows")
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)
    images = convert_from_path(input_file, dpi=dpi)
    base_name = Path(input_file).stem

    for i, img in enumerate(images):
        output_path = os.path.join(output_dir, f"{base_name}_第{i+1}页.{fmt}")
        img.save(output_path, fmt.upper())
        print(f"  ✓ 已转换: {output_path}")

    print(f"\n✅ 转换完成，共 {len(images)} 页")


def main():
    parser = argparse.ArgumentParser(description="PDF 批处理工具")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 合并
    merge_parser = subparsers.add_parser("merge", help="合并多个 PDF")
    merge_parser.add_argument("--input", nargs="+", required=True, help="输入文件列表")
    merge_parser.add_argument("--output", required=True, help="输出文件路径")

    # 拆分
    split_parser = subparsers.add_parser("split", help="拆分 PDF")
    split_parser.add_argument("--input", required=True, help="输入文件")
    split_parser.add_argument("--output-dir", required=True, help="输出目录")
    split_parser.add_argument("--pages", type=int, default=1, help="每个文件的页数")

    # 提取
    extract_parser = subparsers.add_parser("extract", help="提取指定页面")
    extract_parser.add_argument("--input", required=True, help="输入文件")
    extract_parser.add_argument("--pages", required=True, help="页码范围 (如 1,3,5-8)")
    extract_parser.add_argument("--output", required=True, help="输出文件")

    # PDF 转图片
    convert_parser = subparsers.add_parser("toimage", help="PDF 转图片")
    convert_parser.add_argument("--input", required=True, help="输入 PDF")
    convert_parser.add_argument("--output-dir", required=True, help="输出目录")
    convert_parser.add_argument("--format", default="png", choices=["png", "jpg"])
    convert_parser.add_argument("--dpi", type=int, default=200, help="分辨率")

    args = parser.parse_args()

    if args.command == "merge":
        merge_pdfs(args.input, args.output)
    elif args.command == "split":
        split_pdf(args.input, args.output_dir, args.pages)
    elif args.command == "extract":
        extract_pages(args.input, args.pages, args.output)
    elif args.command == "toimage":
        pdf_to_images(args.input, args.output_dir, args.format, args.dpi)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
