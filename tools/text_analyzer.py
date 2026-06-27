"""
文本分析工具
功能：字数统计、关键词提取、文本对比、可读性分析
"""

import os
import sys
import argparse
import re
from collections import Counter
from pathlib import Path


def count_chars(text):
    """统计字符数"""
    return {
        "总字符": len(text),
        "字符(不含空格)": len(text.replace(" ", "").replace("\n", "")),
        "中文字符": len(re.findall(r"[一-鿿]", text)),
        "英文字符": len(re.findall(r"[a-zA-Z]", text)),
        "数字": len(re.findall(r"\d", text)),
        "行数": text.count("\n") + 1,
        "段落数": len([p for p in text.split("\n\n") if p.strip()]),
    }


def extract_keywords(text, top_n=20):
    """提取关键词 (简单词频统计)"""
    # 中文分词 (简单实现：按字分)
    chinese_chars = re.findall(r"[一-鿿]{2,}", text)
    # 英文分词
    english_words = re.findall(r"[a-zA-Z]{3,}", text.lower())

    # 统计
    word_freq = Counter(chinese_chars + english_words)

    # 移除常见停用词
    stopwords = {"的", "是", "在", "了", "和", "与", "及", "等", "或",
                 "这", "那", "有", "为", "到", "从", "也", "就", "都",
                 "the", "and", "for", "that", "this", "with", "you", "are",
                 "not", "but", "have", "has", "had", "was", "were"}

    filtered = {w: c for w, c in word_freq.items() if w not in stopwords}
    return Counter(filtered).most_common(top_n)


def compare_texts(text1, text2):
    """对比两段文本"""
    words1 = set(re.findall(r"\w+", text1.lower()))
    words2 = set(re.findall(r"\w+", text2.lower()))

    common = words1 & words2
    only1 = words1 - words2
    only2 = words2 - words1

    return {
        "文本1词数": len(words1),
        "文本2词数": len(words2),
        "共同词汇": len(common),
        "仅文本1": len(only1),
        "仅文本2": len(only2),
        "相似度": f"{len(common) / len(words1 | words2) * 100:.1f}%"
    }


def readability_score(text):
    """可读性评分 (简化版)"""
    # 中文字符数
    cn_chars = len(re.findall(r"[一-鿿]", text))
    # 英文单词数
    en_words = re.findall(r"[a-zA-Z]+", text)
    # 句子数
    sentences = len(re.split(r"[。！？.!?]+", text)) - 1
    if sentences == 0:
        sentences = 1

    # 平均句长
    total_words = cn_chars + len(en_words)
    avg_sentence_length = total_words / sentences

    # 简单评分
    if avg_sentence_length < 20:
        level = "简单易读"
    elif avg_sentence_length < 40:
        level = "适中"
    elif avg_sentence_length < 60:
        level = "较难"
    else:
        level = "困难"

    return {
        "总词数": total_words,
        "句子数": sentences,
        "平均句长": f"{avg_sentence_length:.1f} 词",
        "可读性": level
    }


def analyze_file(filepath):
    """分析文件"""
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()

    print(f"\n📊 文件分析: {filepath}")
    print("=" * 50)

    # 字数统计
    stats = count_chars(text)
    print("\n📝 字数统计:")
    for k, v in stats.items():
        print(f"   {k}: {v}")

    # 可读性
    readability = readability_score(text)
    print("\n📖 可读性分析:")
    for k, v in readability.items():
        print(f"   {k}: {v}")

    # 关键词
    keywords = extract_keywords(text, 10)
    if keywords:
        print("\n🔑 关键词 (Top 10):")
        for word, freq in keywords:
            print(f"   {word}: {freq}")


def main():
    parser = argparse.ArgumentParser(description="文本分析工具")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 分析文件
    analyze_parser = subparsers.add_parser("analyze", help="分析文本文件")
    analyze_parser.add_argument("--file", required=True, help="文件路径")

    # 关键词
    keyword_parser = subparsers.add_parser("keywords", help="提取关键词")
    keyword_parser.add_argument("--file", required=True)
    keyword_parser.add_argument("--top", type=int, default=20)

    # 对比
    compare_parser = subparsers.add_parser("compare", help="对比两段文本")
    compare_parser.add_argument("--file1", required=True)
    compare_parser.add_argument("--file2", required=True)

    # 统计
    count_parser = subparsers.add_parser("count", help="字数统计")
    count_parser.add_argument("--file", required=True)

    args = parser.parse_args()

    if args.command == "analyze":
        analyze_file(args.file)
    elif args.command == "keywords":
        with open(args.file, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        keywords = extract_keywords(text, args.top)
        print(f"\n🔑 关键词 (Top {args.top}):")
        for word, freq in keywords:
            print(f"   {word}: {freq}")
    elif args.command == "compare":
        with open(args.file1, "r", encoding="utf-8", errors="ignore") as f:
            text1 = f.read()
        with open(args.file2, "r", encoding="utf-8", errors="ignore") as f:
            text2 = f.read()
        result = compare_texts(text1, text2)
        print("\n📊 文本对比:")
        for k, v in result.items():
            print(f"   {k}: {v}")
    elif args.command == "count":
        with open(args.file, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        stats = count_chars(text)
        print("\n📝 字数统计:")
        for k, v in stats.items():
            print(f"   {k}: {v}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
