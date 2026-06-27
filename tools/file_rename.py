"""
批量文件重命名工具
功能：按规则批量重命名文件，支持前缀、序号、日期等模式
"""

import os
import sys
import argparse
import shutil
from datetime import datetime
from pathlib import Path


def get_file_info(filepath):
    """获取文件信息"""
    stat = os.stat(filepath)
    return {
        "name": Path(filepath).stem,
        "ext": Path(filepath).suffix,
        "size": stat.st_size,
        "mtime": datetime.fromtimestamp(stat.st_mtime),
        "ctime": datetime.fromtimestamp(stat.st_ctime),
    }


def rename_by_pattern(directory, pattern, prefix="", start_num=1, dry_run=False):
    """
    按模式重命名文件
    pattern 支持:
      {name} - 原文件名
      {ext}  - 原扩展名
      {date} - 修改日期 (YYYY-MM-DD)
      {num}  - 序号
      {size} - 文件大小(KB)
    """
    files = sorted([
        f for f in os.listdir(directory)
        if os.path.isfile(os.path.join(directory, f)) and not f.startswith(".")
    ])

    if not files:
        print("✗ 目录中没有找到文件")
        return

    print(f"📁 找到 {len(files)} 个文件\n")

    for i, filename in enumerate(files):
        filepath = os.path.join(directory, filename)
        info = get_file_info(filepath)

        # 构建新文件名
        new_name = pattern
        new_name = new_name.replace("{name}", info["name"])
        new_name = new_name.replace("{ext}", info["ext"].lstrip("."))
        new_name = new_name.replace("{date}", info["mtime"].strftime("%Y-%m-%d"))
        new_name = new_name.replace("{num}", str(start_num + i).zfill(4))
        new_name = new_name.replace("{size}", str(info["size"] // 1024))

        # 加前缀
        if prefix:
            new_name = f"{prefix}_{new_name}"

        # 确保扩展名正确
        if not new_name.endswith(info["ext"]):
            new_name += info["ext"]

        new_path = os.path.join(directory, new_name)

        if dry_run:
            print(f"  [预览] {filename} → {new_name}")
        else:
            if filepath != new_path:
                # 避免覆盖
                if os.path.exists(new_path):
                    base, ext = os.path.splitext(new_path)
                    new_path = f"{base}_{i}{ext}"
                os.rename(filepath, new_path)
                print(f"  ✓ {filename} → {os.path.basename(new_path)}")

    action = "预览" if dry_run else "完成"
    print(f"\n✅ 重命名{action}，共 {len(files)} 个文件")


def batch_convert_extension(directory, old_ext, new_ext, dry_run=False):
    """批量转换文件扩展名"""
    files = [f for f in os.listdir(directory) if f.endswith(old_ext)]

    if not files:
        print(f"✗ 没有找到 {old_ext} 文件")
        return

    print(f"📁 找到 {len(files)} 个 {old_ext} 文件\n")

    for filename in files:
        new_name = filename.replace(old_ext, new_ext)
        old_path = os.path.join(directory, filename)
        new_path = os.path.join(directory, new_name)

        if dry_run:
            print(f"  [预览] {filename} → {new_name}")
        else:
            os.rename(old_path, new_path)
            print(f"  ✓ {filename} → {new_name}")

    action = "预览" if dry_run else "完成"
    print(f"\n✅ 转换{action}")


def add_prefix_suffix(directory, prefix="", suffix="", dry_run=False):
    """批量添加前缀/后缀"""
    files = [f for f in os.listdir(directory)
             if os.path.isfile(os.path.join(directory, f)) and not f.startswith(".")]

    print(f"📁 找到 {len(files)} 个文件\n")

    for filename in files:
        name, ext = os.path.splitext(filename)
        new_name = f"{prefix}{name}{suffix}{ext}"
        old_path = os.path.join(directory, filename)
        new_path = os.path.join(directory, new_name)

        if dry_run:
            print(f"  [预览] {filename} → {new_name}")
        else:
            if filepath != new_path:
                os.rename(old_path, new_path)
                print(f"  ✓ {filename} → {new_name}")

    action = "预览" if dry_run else "完成"
    print(f"\n✅ 处理{action}")


def main():
    parser = argparse.ArgumentParser(description="批量文件重命名工具")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 模式重命名
    rename_parser = subparsers.add_parser("rename", help="按模式重命名")
    rename_parser.add_argument("--dir", required=True, help="目标目录")
    rename_parser.add_argument("--pattern", required=True,
                               help="命名模式 (支持 {name} {ext} {date} {num} {size})")
    rename_parser.add_argument("--prefix", default="", help="前缀")
    rename_parser.add_argument("--start", type=int, default=1, help="起始序号")
    rename_parser.add_argument("--dry-run", action="store_true", help="仅预览不执行")

    # 扩展名转换
    convert_parser = subparsers.add_parser("convert", help="批量转换扩展名")
    convert_parser.add_argument("--dir", required=True, help="目标目录")
    convert_parser.add_argument("--from", dest="old_ext", required=True, help="原扩展名")
    convert_parser.add_argument("--to", dest="new_ext", required=True, help="新扩展名")
    convert_parser.add_argument("--dry-run", action="store_true", help="仅预览不执行")

    # 添加前后缀
    affix_parser = subparsers.add_parser("affix", help="添加前缀/后缀")
    affix_parser.add_argument("--dir", required=True, help="目标目录")
    affix_parser.add_argument("--prefix", default="", help="前缀")
    affix_parser.add_argument("--suffix", default="", help="后缀")
    affix_parser.add_argument("--dry-run", action="store_true", help="仅预览不执行")

    args = parser.parse_args()

    if args.command == "rename":
        rename_by_pattern(args.dir, args.pattern, args.prefix, args.start, args.dry_run)
    elif args.command == "convert":
        batch_convert_extension(args.dir, args.old_ext, args.new_ext, args.dry_run)
    elif args.command == "affix":
        add_prefix_suffix(args.dir, args.prefix, args.suffix, args.dry_run)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
