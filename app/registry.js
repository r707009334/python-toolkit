/**
 * registry.js — 策略注册表
 *
 * 新增一个策略只需要两步：
 *   1. 新建 st_xxx.js，默认导出一个对象，含
 *        id / name / sub / order / exp
 *        async refresh()      → 返回该策略自己的数据对象（内部自己取数、自己算）
 *        status(r) / statusCls(r)
 *        kpis(r)   → [{k, v, s}]
 *        foot(r)   → 卡片底部一行 HTML
 *        detail(r) → 详情页 HTML
 *        chart(r)  → 可选，{id, dates, series, marks, yMin, yMax}
 *        spark(r)  → 可选，返回数字数组画缩略走势
 *   2. 在下面 import 并加进 STRATEGIES（order 决定排序）
 *
 * 主流程（app.js）不认识任何具体策略，只按接口调用。
 * 一个策略报错不会拖垮其他卡片——每条 refresh 都是独立 try/catch。
 */
import grid from './st_grid.js';
import rsi from './st_rsi.js';
import etf300 from './st_etf300.js';
import div from './st_div.js';

export const STRATEGIES = [grid, rsi, etf300, div]
  .sort((a, b) => (a.order || 99) - (b.order || 99));
