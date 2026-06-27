"""
图片批处理工具
功能：批量压缩、格式转换、调整尺寸、添加水印
"""

import os
import sys
import argparse
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("请先安装依赖: pip install Pillow")
    sys.exit(1)


def batch_resize(directory, output_dir, width=None, height=None,
                 quality=85, fmt=None, max_size_kb=None):
    """批量调整图片尺寸"""
    os.makedirs(output_dir, exist_ok=True)
    supported = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp"}

    files = [f for f in os.listdir(directory)
             if Path(f).suffix.lower() in supported]

    if not files:
        print("✗ 没有找到图片文件")
        return

    print(f"📁 找到 {len(files)} 张图片\n")

    for filename in files:
        try:
            img = Image.open(os.path.join(directory, filename))

            # 调整尺寸
            if width or height:
                orig_w, orig_h = img.size
                if width and height:
                    new_w, new_h = width, height
                elif width:
                    ratio = width / orig_w
                    new_w, new_h = width, int(orig_h * ratio)
                else:
                    ratio = height / orig_h
                    new_w, new_h = int(orig_w * ratio), height
                img = img.resize((new_w, new_h), Image.LANCZOS)

            # 保存
            save_fmt = fmt or Path(filename).suffix.lstrip(".").upper()
            if save_fmt == "JPG":
                save_fmt = "JPEG"

            out_name = f"{Path(filename).stem}.{save_fmt.lower()}"
            out_path = os.path.join(output_dir, out_name)

            save_kwargs = {"format": save_fmt}
            if save_fmt in ("JPEG", "WEBP"):
                save_kwargs["quality"] = quality

            img.save(out_path, **save_kwargs)

            # 检查文件大小
            if max_size_kb:
                file_size = os.path.getsize(out_path) / 1024
                if file_size > max_size_kb:
                    # 降低质量重新保存
                    for q in range(quality, 10, -5):
                        save_kwargs["quality"] = q
                        img.save(out_path, **save_kwargs)
                        if os.path.getsize(out_path) / 1024 <= max_size_kb:
                            break

            print(f"  ✓ {filename} → {out_name}")
        except Exception as e:
            print(f"  ✗ {filename}: {e}")

    print(f"\n✅ 处理完成")


def batch_compress(directory, output_dir, quality=60):
    """批量压缩图片"""
    batch_resize(directory, output_dir, quality=quality)


def batch_convert(directory, output_dir, target_format="png"):
    """批量转换格式"""
    batch_resize(directory, output_dir, fmt=target_format)


def add_watermark(image_path, output_path, text, position="bottom-right",
                  opacity=128, font_size=20):
    """给图片添加文字水印"""
    img = Image.open(image_path).convert("RGBA")
    txt_layer = Image.new("RGBA", img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(txt_layer)

    # 尝试使用系统字体
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except OSError:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
        except OSError:
            font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    txt_w = bbox[2] - bbox[0]
    txt_h = bbox[3] - bbox[1]

    img_w, img_h = img.size
    margin = 20

    if position == "bottom-right":
        x, y = img_w - txt_w - margin, img_h - txt_h - margin
    elif position == "bottom-left":
        x, y = margin, img_h - txt_h - margin
    elif position == "top-right":
        x, y = img_w - txt_w - margin, margin
    elif position == "top-left":
        x, y = margin, margin
    else:  # center
        x, y = (img_w - txt_w) // 2, (img_h - txt_h) // 2

    draw.text((x, y), text, font=font, fill=(255, 255, 255, opacity))

    result = Image.alpha_composite(img, txt_layer).convert("RGB")
    result.save(output_path)
    print(f"  ✓ 已添加水印: {os.path.basename(output_path)}")


def batch_watermark(directory, output_dir, text, **kwargs):
    """批量添加水印"""
    os.makedirs(output_dir, exist_ok=True)
    supported = {".jpg", ".jpeg", ".png", ".bmp"}

    files = [f for f in os.listdir(directory)
             if Path(f).suffix.lower() in supported]

    print(f"📁 找到 {len(files)} 张图片\n")

    for filename in files:
        input_path = os.path.join(directory, filename)
        output_path = os.path.join(output_dir, filename)
        add_watermark(input_path, output_path, text, **kwargs)

    print(f"\n✅ 水印添加完成")


def main():
    parser = argparse.ArgumentParser(description="图片批处理工具")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 调整尺寸
    resize_parser = subparsers.add_parser("resize", help="调整图片尺寸")
    resize_parser.add_argument("--dir", required=True, help="图片目录")
    resize_parser.add_argument("--output", required=True, help="输出目录")
    resize_parser.add_argument("--width", type=int, help="目标宽度")
    resize_parser.add_argument("--height", type=int, help="目标高度")
    resize_parser.add_argument("--quality", type=int, default=85)

    # 压缩
    compress_parser = subparsers.add_parser("compress", help="压缩图片")
    compress_parser.add_argument("--dir", required=True)
    compress_parser.add_argument("--output", required=True)
    compress_parser.add_argument("--quality", type=int, default=60)

    # 格式转换
    convert_parser = subparsers.add_parser("convert", help="格式转换")
    convert_parser.add_argument("--dir", required=True)
    convert_parser.add_argument("--output", required=True)
    convert_parser.add_argument("--format", default="png")

    # 水印
    watermark_parser = subparsers.add_parser("watermark", help="添加水印")
    watermark_parser.add_argument("--dir", required=True)
    watermark_parser.add_argument("--output", required=True)
    watermark_parser.add_argument("--text", required=True, help="水印文字")
    watermark_parser.add_argument("--position", default="bottom-right",
                                  choices=["top-left", "top-right",
                                          "bottom-left", "bottom-right", "center"])
    watermark_parser.add_argument("--font-size", type=int, default=20)

    args = parser.parse_args()

    if args.command == "resize":
        batch_resize(args.dir, args.output, args.width, args.height, args.quality)
    elif args.command == "compress":
        batch_compress(args.dir, args.output, args.quality)
    elif args.command == "convert":
        batch_convert(args.dir, args.output, args.format)
    elif args.command == "watermark":
        batch_watermark(args.dir, args.output, args.text,
                       position=args.position, font_size=args.font_size)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
