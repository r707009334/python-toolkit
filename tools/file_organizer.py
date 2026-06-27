"""
文件夹自动整理工具
功能：按文件类型、日期自动分类整理文件
"""

import os
import sys
import argparse
import shutil
from datetime import datetime
from pathlib import Path


# 文件类型分类映射
TYPE_CATEGORIES = {
    "图片": {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico"},
    "文档": {".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".md"},
    "表格": {".xls", ".xlsx", ".csv", ".ods"},
    "演示": {".ppt", ".pptx", ".odp"},
    "视频": {".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv"},
    "音频": {".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma"},
    "压缩包": {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"},
    "代码": {".py", ".js", ".java", ".c", ".cpp", ".h", ".html", ".css", ".json", ".xml"},
    "可执行文件": {".exe", ".msi", ".dmg", ".app"},
}


def get_category(filename):
    """根据文件扩展名获取分类"""
    ext = Path(filename).suffix.lower()
    for category, extensions in TYPE_CATEGORIES.items():
        if ext in extensions:
            return category
    return "其他"


def organize_by_type(directory, dry_run=False):
    """按文件类型分类整理"""
    files = [f for f in os.listdir(directory)
             if os.path.isfile(os.path.join(directory, f)) and not f.startswith(".")]

    if not files:
        print("✗ 目录中没有文件")
        return

    print(f"📁 找到 {len(files)} 个文件\n")

    moved = 0
    for filename in files:
        category = get_category(filename)
        src = os.path.join(directory, filename)
        dst_dir = os.path.join(directory, category)
        dst = os.path.join(dst_dir, filename)

        if dry_run:
            print(f"  [预览] {filename} → {category}/")
        else:
            os.makedirs(dst_dir, exist_ok=True)
            if src != dst:
                if os.path.exists(dst):
                    base, ext = os.path.splitext(filename)
                    dst = os.path.join(dst_dir, f"{base}_{datetime.now().strftime('%H%M%S')}{ext}")
                shutil.move(src, dst)
                print(f"  ✓ {filename} → {category}/")
                moved += 1

    action = "预览" if dry_run else "完成"
    print(f"\n✅ 整理{action}")


def organize_by_date(directory, dry_run=False, date_format="%Y-%m"):
    """按修改日期分类整理"""
    files = [f for f in os.listdir(directory)
             if os.path.isfile(os.path.join(directory, f)) and not f.startswith(".")]

    if not files:
        print("✗ 目录中没有文件")
        return

    print(f"📁 找到 {len(files)} 个文件\n")

    for filename in files:
        filepath = os.path.join(directory, filename)
        mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
        date_folder = mtime.strftime(date_format)

        src = filepath
        dst_dir = os.path.join(directory, date_folder)
        dst = os.path.join(dst_dir, filename)

        if dry_run:
            print(f"  [预览] {filename} → {date_folder}/")
        else:
            os.makedirs(dst_dir, exist_ok=True)
            if src != dst:
                shutil.move(src, dst)
                print(f"  ✓ {filename} → {date_folder}/")

    action = "预览" if dry_run else "完成"
    print(f"\n✅ 整理{action}")


def clean_empty_dirs(directory, dry_run=False):
    """清理空文件夹"""
    count = 0
    for root, dirs, files in os.walk(directory, topdown=False):
        for d in dirs:
            dir_path = os.path.join(root, d)
            if not os.listdir(dir_path):
                if dry_run:
                    print(f"  [预览] 删除空目录: {dir_path}")
                else:
                    os.rmdir(dir_path)
                    print(f"  ✓ 删除空目录: {dir_path}")
                    count += 1

    action = "预览" if dry_run else "完成"
    print(f"\n✅ 清理{action}，共 {count} 个空目录")


def main():
    parser = argparse.ArgumentParser(description="文件夹自动整理工具")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 按类型整理
    type_parser = subparsers.add_parser("by-type", help="按文件类型分类")
    type_parser.add_argument("--dir", required=True, help="目标目录")
    type_parser.add_argument("--dry-run", action="store_true", help="仅预览")

    # 按日期整理
    date_parser = subparsers.add_parser("by-date", help="按修改日期分类")
    date_parser.add_argument("--dir", required=True, help="目标目录")
    date_parser.add_argument("--format", default="%Y-%m", help="日期格式 (默认: 年-月)")
    date_parser.add_argument("--dry-run", action="store_true", help="仅预览")

    # 清理空目录
    clean_parser = subparsers.add_parser("clean", help="清理空文件夹")
    clean_parser.add_argument("--dir", required=True, help="目标目录")
    clean_parser.add_argument("--dry-run", action="store_true", help="仅预览")

    args = parser.parse_args()

    if args.command == "by-type":
        organize_by_type(args.dir, args.dry_run)
    elif args.command == "by-date":
        organize_by_date(args.dir, args.dry_run, args.format)
    elif args.command == "clean":
        clean_empty_dirs(args.dir, args.dry_run)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
