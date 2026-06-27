# V2EX 帖子

## 标题
[开源/分享] Python 自动化工具包 — 12 个即用脚本，PDF/Excel/爬虫/文件整理

## 内容

折腾了一段时间，写了一套 Python 自动化工具包，分享给有需要的 V 友。

### 包含 12 个工具

- PDF 处理：合并、拆分、提取页面、加水印、转图片
- 网页抓取：抓表格、抓文章、抓链接
- 文件管理：批量重命名、文件夹自动分类
- Excel 处理：合并多表、数据筛选、格式转换
- 图片处理：批量压缩、格式转换、加水印
- 文本处理：批量替换、关键词搜索、文本分析
- 批量下载：并发下载、网页图片批量保存

### 使用效果

```bash
# 整理下载文件夹（按类型自动分到子目录）
python tools/file_organizer.py by-type --dir ~/Downloads

# 合并 PDF
python tools/pdf_processor.py merge --input a.pdf b.pdf --output merged.pdf

# 抓取网页表格到 CSV
python tools/web_scraper.py --url https://example.com/table --mode table --output data.csv
```

### 技术栈

纯 Python，依赖：PyPDF2、requests、beautifulsoup4、pandas、Pillow 等。

代码写得比较清晰，注释也够，方便二次开发。

### 获取

GitHub：[待填写]

如果觉得好用，欢迎请作者喝杯咖啡 ☕（¥29.9，12 个工具）

---

V 友们有什么建议或者想要的新工具，欢迎评论区提。
