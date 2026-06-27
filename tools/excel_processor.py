"""
Excel 批处理工具
功能：合并多个 Excel、数据筛选、格式转换、统计分析
"""

import os
import sys
import argparse
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("请先安装依赖: pip install pandas openpyxl")
    sys.exit(1)


def merge_excels(input_files, output_file, sheet_name=None):
    """合并多个 Excel 文件"""
    all_data = []
    for f in input_files:
        if not os.path.exists(f):
            print(f"  ✗ 文件不存在: {f}")
            continue
        try:
            df = pd.read_excel(f, sheet_name=sheet_name or 0)
            df["_来源文件"] = Path(f).name
            all_data.append(df)
            print(f"  ✓ 已读取: {f} ({len(df)} 行)")
        except Exception as e:
            print(f"  ✗ 读取失败: {f} - {e}")

    if all_data:
        merged = pd.concat(all_data, ignore_index=True)
        merged.to_excel(output_file, index=False)
        print(f"\n✅ 合并完成: {output_file} ({len(merged)} 行)")
    else:
        print("✗ 没有数据可合并")


def excel_to_csv(input_file, output_file, sheet_name=None):
    """Excel 转 CSV"""
    df = pd.read_excel(input_file, sheet_name=sheet_name or 0)
    df.to_csv(output_file, index=False, encoding="utf-8-sig")
    print(f"✅ 转换完成: {output_file} ({len(df)} 行)")


def csv_to_excel(input_file, output_file, sheet_name="Sheet1"):
    """CSV 转 Excel"""
    df = pd.read_csv(input_file, encoding="utf-8-sig")
    df.to_excel(output_file, index=False, sheet_name=sheet_name)
    print(f"✅ 转换完成: {output_file} ({len(df)} 行)")


def filter_excel(input_file, output_file, column, condition, value):
    """
    筛选 Excel 数据
    condition: eq(等于), ne(不等于), gt(大于), lt(小于), contains(包含)
    """
    df = pd.read_excel(input_file)

    if column not in df.columns:
        print(f"✗ 列 '{column}' 不存在")
        print(f"  可用列: {', '.join(df.columns)}")
        return

    if condition == "eq":
        filtered = df[df[column] == value]
    elif condition == "ne":
        filtered = df[df[column] != value]
    elif condition == "gt":
        filtered = df[df[column] > float(value)]
    elif condition == "lt":
        filtered = df[df[column] < float(value)]
    elif condition == "contains":
        filtered = df[df[column].astype(str).str.contains(value, na=False)]
    else:
        print(f"✗ 未知条件: {condition}")
        return

    filtered.to_excel(output_file, index=False)
    print(f"✅ 筛选完成: {len(filtered)}/{len(df)} 行 → {output_file}")


def analyze_excel(input_file, column=None):
    """分析 Excel 数据"""
    df = pd.read_excel(input_file)
    print(f"\n📊 数据概览: {input_file}")
    print(f"   行数: {len(df)}")
    print(f"   列数: {len(df.columns)}")
    print(f"   列名: {', '.join(df.columns)}")

    if column and column in df.columns:
        print(f"\n📈 列 '{column}' 统计:")
        print(df[column].describe())

    # 检查缺失值
    missing = df.isnull().sum()
    if missing.any():
        print(f"\n⚠️ 缺失值:")
        for col, count in missing[missing > 0].items():
            print(f"   {col}: {count} ({count/len(df)*100:.1f}%)")


def remove_duplicates(input_file, output_file, columns=None):
    """去除重复行"""
    df = pd.read_excel(input_file)
    before = len(df)

    if columns:
        df = df.drop_duplicates(subset=columns)
    else:
        df = df.drop_duplicates()

    df.to_excel(output_file, index=False)
    print(f"✅ 去重完成: {before} → {len(df)} 行 (移除 {before - len(df)} 行)")


def main():
    parser = argparse.ArgumentParser(description="Excel 批处理工具")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 合并
    merge_parser = subparsers.add_parser("merge", help="合并多个 Excel")
    merge_parser.add_argument("--input", nargs="+", required=True, help="输入文件")
    merge_parser.add_argument("--output", required=True, help="输出文件")

    # 转换
    to_csv_parser = subparsers.add_parser("to-csv", help="Excel 转 CSV")
    to_csv_parser.add_argument("--input", required=True)
    to_csv_parser.add_argument("--output", required=True)

    to_excel_parser = subparsers.add_parser("to-excel", help="CSV 转 Excel")
    to_excel_parser.add_argument("--input", required=True)
    to_excel_parser.add_argument("--output", required=True)

    # 筛选
    filter_parser = subparsers.add_parser("filter", help="筛选数据")
    filter_parser.add_argument("--input", required=True)
    filter_parser.add_argument("--output", required=True)
    filter_parser.add_argument("--column", required=True, help="列名")
    filter_parser.add_argument("--condition", required=True,
                               choices=["eq", "ne", "gt", "lt", "contains"])
    filter_parser.add_argument("--value", required=True)

    # 分析
    analyze_parser = subparsers.add_parser("analyze", help="数据分析")
    analyze_parser.add_argument("--input", required=True)
    analyze_parser.add_argument("--column", help="指定列统计")

    # 去重
    dedup_parser = subparsers.add_parser("dedup", help="去除重复行")
    dedup_parser.add_argument("--input", required=True)
    dedup_parser.add_argument("--output", required=True)
    dedup_parser.add_argument("--columns", nargs="+", help="指定列去重")

    args = parser.parse_args()

    if args.command == "merge":
        merge_excels(args.input, args.output)
    elif args.command == "to-csv":
        excel_to_csv(args.input, args.output)
    elif args.command == "to-excel":
        csv_to_excel(args.input, args.output)
    elif args.command == "filter":
        filter_excel(args.input, args.output, args.column, args.condition, args.value)
    elif args.command == "analyze":
        analyze_excel(args.input, args.column)
    elif args.command == "dedup":
        remove_duplicates(args.input, args.output, args.columns)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
