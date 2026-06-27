"""
文本批量替换工具
功能：批量替换多个文件中的指定文本
"""

import os
import sys
import argparse
import re
from pathlib import Path


def replace_in_files(directory, old_text, new_text, extensions=None,
                     recursive=True, dry_run=False):
    """批量替换文件中的文本"""
    if extensions:
        ext_set = set(extensions.split(","))
    else:
        ext_set = None

    count = 0
    files_modified = 0

    for root, dirs, files in os.walk(directory):
        # 跳过隐藏目录
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        for filename in files:
            filepath = os.path.join(root, filename)

            # 过滤扩展名
            if ext_set:
                if Path(filename).suffix.lower() not in ext_set:
                    continue

            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()

                if old_text in content:
                    new_content = content.replace(old_text, new_text)
                    occurrences = content.count(old_text)

                    if dry_run:
                        print(f"  [预览] {filepath}: {occurrences} 处")
                    else:
                        with open(filepath, "w", encoding="utf-8") as f:
                            f.write(new_content)
                        print(f"  ✓ {filepath}: {occurrences} 处")

                    count += occurrences
                    files_modified += 1

            except Exception as e:
                print(f"  ✗ {filepath}: {e}")

            if not recursive:
                break

    action = "预览" if dry_run else "完成"
    print(f"\n✅ 替换{action}: {files_modified} 个文件, {count} 处替换")


def regex_replace_in_files(directory, pattern, replacement,
                           extensions=None, recursive=True, dry_run=False):
    """正则表达式批量替换"""
    regex = re.compile(pattern)

    if extensions:
        ext_set = set(extensions.split(","))
    else:
        ext_set = None

    count = 0
    files_modified = 0

    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        for filename in files:
            filepath = os.path.join(root, filename)

            if ext_set and Path(filename).suffix.lower() not in ext_set:
                continue

            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()

                new_content, n = regex.subn(replacement, content)

                if n > 0:
                    if dry_run:
                        print(f"  [预览] {filepath}: {n} 处")
                    else:
                        with open(filepath, "w", encoding="utf-8") as f:
                            f.write(new_content)
                        print(f"  ✓ {filepath}: {n} 处")

                    count += n
                    files_modified += 1

            except Exception as e:
                print(f"  ✗ {filepath}: {e}")

            if not recursive:
                break

    action = "预览" if dry_run else "完成"
    print(f"\n✅ 正则替换{action}: {files_modified} 个文件, {count} 处替换")


def find_in_files(directory, keyword, extensions=None, recursive=True):
    """在文件中搜索关键词"""
    if extensions:
        ext_set = set(extensions.split(","))
    else:
        ext_set = None

    results = []

    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        for filename in files:
            filepath = os.path.join(root, filename)

            if ext_set and Path(filename).suffix.lower() not in ext_set:
                continue

            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    for i, line in enumerate(f, 1):
                        if keyword in line:
                            results.append({
                                "file": filepath,
                                "line": i,
                                "content": line.strip()
                            })
            except Exception:
                pass

            if not recursive:
                break

    print(f"🔍 找到 {len(results)} 处匹配:\n")
    for r in results:
        print(f"  {r['file']}:{r['line']}")
        print(f"    {r['content'][:100]}")
        print()


def main():
    parser = argparse.ArgumentParser(description="文本批量替换工具")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 替换
    replace_parser = subparsers.add_parser("replace", help="批量替换文本")
    replace_parser.add_argument("--dir", required=True, help="目标目录")
    replace_parser.add_argument("--old", required=True, help="原文本")
    replace_parser.add_argument("--new", required=True, help="新文本")
    replace_parser.add_argument("--ext", help="文件扩展名 (逗号分隔, 如 .txt,.py)")
    replace_parser.add_argument("--no-recursive", action="store_true")
    replace_parser.add_argument("--dry-run", action="store_true")

    # 正则替换
    regex_parser = subparsers.add_parser("regex", help="正则表达式替换")
    regex_parser.add_argument("--dir", required=True)
    regex_parser.add_argument("--pattern", required=True, help="正则表达式")
    regex_parser.add_argument("--replacement", required=True)
    regex_parser.add_argument("--ext", help="文件扩展名")
    regex_parser.add_argument("--no-recursive", action="store_true")
    regex_parser.add_argument("--dry-run", action="store_true")

    # 搜索
    find_parser = subparsers.add_parser("find", help="搜索关键词")
    find_parser.add_argument("--dir", required=True)
    find_parser.add_argument("--keyword", required=True)
    find_parser.add_argument("--ext", help="文件扩展名")
    find_parser.add_argument("--no-recursive", action="store_true")

    args = parser.parse_args()

    recursive = not args.no_recursive

    if args.command == "replace":
        exts = args.ext.split(",") if args.ext else None
        replace_in_files(args.dir, args.old, args.new, exts, recursive, args.dry_run)
    elif args.command == "regex":
        exts = args.ext.split(",") if args.ext else None
        regex_replace_in_files(args.dir, args.pattern, args.replacement,
                              exts, recursive, args.dry_run)
    elif args.command == "find":
        exts = args.ext.split(",") if args.ext else None
        find_in_files(args.dir, args.keyword, exts, recursive)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
