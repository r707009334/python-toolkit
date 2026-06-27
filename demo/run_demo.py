"""
产品演示脚本 — 运行后自动生成演示文件和截图
"""
import os
import sys
import subprocess
import io

# Windows 控制台 UTF-8 支持
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 添加工具包路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(DEMO_DIR, "output")


def run_cmd(cmd, desc):
    """运行命令并打印"""
    print(f"\n{'='*50}")
    print(f"demo: {desc}")
    print(f"cmd: {cmd}")
    print(f"{'='*50}")
    result = subprocess.run(
        cmd, shell=True, capture_output=True,
        encoding='utf-8', errors='replace'
    )
    if result.stdout:
        print(result.stdout)
    if result.returncode != 0 and result.stderr:
        print(f"error: {result.stderr[:200]}")
    return result


def create_demo_files():
    """创建演示用的文件"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 创建示例文本文件 (使用 ASCII 文件名避免编码问题)
    texts = {
        "doc1.txt": "这是一份测试文档。包含中文内容和English content。\n第二行内容。",
        "doc2.txt": "另一份测试文档。用于演示文本替换功能。\n第二行。",
        "report.txt": "2026年第一季度销售报告\n销售额：100万元\n同比增长：15%",
    }

    for name, content in texts.items():
        with open(os.path.join(OUTPUT_DIR, name), "w", encoding="utf-8") as f:
            f.write(content)
    print(f"已创建 {len(texts)} 个演示文件")


def demo_text_analyzer():
    """演示文本分析"""
    run_cmd(
        f'python {os.path.join(DEMO_DIR, "..", "tools", "text_analyzer.py")} analyze --file {os.path.join(OUTPUT_DIR, "report.txt")}',
        "demo: text analysis"
    )


def demo_file_rename():
    """演示文件重命名"""
    # 创建临时文件
    for i in range(5):
        path = os.path.join(OUTPUT_DIR, f"IMG_{i:04d}.txt")
        with open(path, "w") as f:
            f.write(f"Photo {i}")

    run_cmd(
        f'python {os.path.join(DEMO_DIR, "..", "tools", "file_rename.py")} rename --dir {OUTPUT_DIR} --pattern "photo_{{num}}" --start 1 --dry-run',
        "demo: batch rename (preview)"
    )


def demo_text_replace():
    """演示文本替换"""
    run_cmd(
        f'python {os.path.join(DEMO_DIR, "..", "tools", "text_replacer.py")} find --dir {OUTPUT_DIR} --keyword "sales"',
        "demo: search keyword"
    )


def main():
    print("Python Toolkit - Product Demo")
    print(f"Demo dir: {OUTPUT_DIR}\n")

    print("Step 1: Create demo files")
    create_demo_files()

    print("\nStep 2: Run tool demos")
    demo_text_analyzer()
    demo_file_rename()
    demo_text_replace()

    print(f"\n{'='*50}")
    print("Demo complete!")
    print(f"Output in: {OUTPUT_DIR}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
