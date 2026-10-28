/**
 * st_rsi.js — RSI(14) 三标的 + 量能
 *
 * 与 D:/量化/strategies 的口径对齐：
 *   · RSI 用**后复权**收盘（除息跳空会污染 RSI，这是 2026-10-18 那次教训的主因）
 *   · 515080 / 159985 阈值 34/82，512890 阈值 34/75（不是 82，这条最容易搞错）
 *   · 量能：日量 vs 前 20 日均量、周量（滚动 5 日）vs 20 周均量，阈值均 2.5×
 *     位置 = 收盘 vs MA250，±5% 分高低位（volume_monitor.py 原样搬运）
 */
import { syncKline, RSI, MA, pctRank, F, cls } from './core.js';

const SETS = [
  { code: '515080', sym: 'sh515080', label: '中证红利', buy: 34, sell: 82, live: true },
  { code: '512890', sym: 'sh512890', label: '红利低波', buy: 34, sell: 75, live: true },
  { code: '159985', sym: 'sz159985', label: '豆粕', buy: 34, sell: 82, live: false }
];

const D_VOL_K = 2.5, W_VOL_K = 2.5, LOW_POS = -0.05, HIGH_POS = 0.05;

function judge(rsi, buy, sell) {
  if (rsi < buy) return { lv: 'BUY', tag: '买', desc: '超卖', toBuy: 0 };
  if (rsi > sell) return { lv: 'SELL', tag: '卖', desc: '超买', toBuy: 0 };
  if (rsi - buy < 5) return { lv: 'WATCH_BUY', tag: '近买', desc: '接近买线', toBuy: rsi - buy };
  if (sell - rsi < 5) return { lv: 'WATCH_SELL', tag: '近卖', desc: '接近卖线', toBuy: 0 };
  return { lv: 'MID', tag: '', desc: '中性', toBuy: rsi - buy };
}

function volumeOf(k) {
  if (!k || !k.v || k.v.length < 260) return { ok: false, err: '量能数据不足' };
  const close = k.c, vol = k.v, n = close.length;
  const dMa = vol.slice(n - 21, n - 1).reduce((a, b) => a + b, 0) / 20;
  const dNow = vol[n - 1];
  const dK = dMa ? dNow / dMa : 0;

  const wNow = vol.slice(n - 5).reduce((a, b) => a + b, 0);
  const wh = [];
  for (let i = n - 5; i >= n - 5 - 20 * 5 && i - 4 >= 0; i -= 5) {
    wh.push(vol.slice(i - 4, i + 1).reduce((a, b) => a + b, 0));
  }
  const wMa = wh.length ? wh.reduce((a, b) => a + b, 0) / wh.length : 0;
  const wK = wMa ? wNow / wMa : 0;

  const ma250 = close.slice(-250).reduce((a, b) => a + b, 0) / Math.min(250, n);
  const pos = close[n - 1] / ma250 - 1;
  const ret5 = n > 6 ? close[n - 1] / close[n - 6] - 1 : 0;

  const isVol = dK >= D_VOL_K || wK >= W_VOL_K;
  let lv, desc;
  if (isVol && pos <= LOW_POS) { lv = 'ACCUMULATE'; desc = '低位放量 → 承接信号'; }
  else if (isVol && pos >= HIGH_POS) {
    if (ret5 > 0.03) { lv = 'WATCH_HIGH'; desc = '高位放量但仍在涨 → 观察'; }
    else { lv = 'DISTRIBUTE'; desc = '高位放量滞涨 → 出货信号'; }
  } else if (isVol) { lv = 'UNUSUAL'; desc = '放量异动（位置中性）'; }
  else { lv = 'NORMAL'; desc = '量能正常'; }

  return {
    ok: true, date: k.d[n - 1], close: close[n - 1], ma250, pos, dK, wK, ret5,
    level: lv, desc, dNow, wNow
  };
}

export default {
  id: 'rsi',
  name: 'RSI(14) 三标的 + 量能',
  sub: '34 买 / 82·75 卖',
  order: 20,
  exp: '回测预期 年化 14.9 / 15.8 / 15.0% · 超额 +3.9 / +5.8 / +2.6pp（豆粕只记录）',

  async refresh() {
    const ks = await Promise.all(SETS.map(s => syncKline(s.code).catch(() => null)));
    const vol = await syncKline('510310').catch(() => null);
    const items = SETS.map((s, i) => {
      const k = ks[i];
      if (!k) return { ...s, err: '数据缺失' };
      const r = RSI(k.hf, 14);
      const last = r[r.length - 1];
      const prev = r[r.length - 2];
      const j = judge(last, s.buy, s.sell);
      return {
        ...s, date: k.d[k.d.length - 1], close: k.c[k.c.length - 1],
        rsi: last, prev, pct: pctRank(r, last, 250), ...j,
        near5: r.slice(-5).map(v => v == null ? null : +v.toFixed(1)),
        series: r.slice(-180).map(v => v == null ? null : +v.toFixed(2)),
        dates: k.d.slice(-180),
        under: k.d.length
      };
    });
    return { items, vol: volumeOf(vol) };
  },

  status(r) {
    const live = r.items.filter(i => i.live && !i.err);
    if (live.some(i => i.lv === 'BUY')) return '有买点';
    if (live.some(i => i.lv === 'SELL')) return '有卖点';
    if (live.some(i => i.lv === 'WATCH_BUY')) return '近买点';
    if (live.some(i => i.lv === 'WATCH_SELL')) return '近卖点';
    return '中性';
  },
  statusCls(r) {
    const s = this.status(r);
    return s === '有买点' ? 'buy' : (s === '有卖点' ? 'watch' : 'ok');
  },

  kpis(r) {
    return r.items.map(i => ({
      k: i.label, v: i.err ? '—' : F.n(i.rsi, 1),
      s: i.err ? '' : ' ' + i.tag
    }));
  },

  foot(r) {
    const v = r.vol;
    if (!v.ok) return '量能：' + (v.err || '数据缺失');
    return `<b>510310</b>：位置 ${F.sign(v.pos * 100, 0)}%（年线 ${F.n(v.ma250, 3)}）· 周量 ${F.n(v.wK, 2)}× → ${v.desc}`;
  },

  detail(r) {
    const rows = r.items.map(i => {
      if (i.err) return `<tr><td>${i.label}</td><td colspan="5">${i.err}</td></tr>`;
      const c = (i.lv === 'BUY' || i.lv === 'WATCH_BUY') ? 'pos' : (i.lv === 'SELL' || i.lv === 'WATCH_SELL' ? 'neg' : '');
      return `<tr><td>${i.code} ${i.label} <span class="tag">${i.live ? '实盘' : '观察'}</span></td>
        <td>${F.n(i.close, 3)}</td><td><b>${F.n(i.rsi, 2)}</b></td><td>${F.n(i.pct, 0)}%</td>
        <td>${i.buy} / ${i.sell}</td><td class="${c}">${i.desc}${i.lv === 'WATCH_BUY' ? `（距买 ${F.n(i.toBuy, 1)}）` : ''}</td></tr>`;
    }).join('');

    const v = r.vol;
    const volBlock = v.ok ? `
    <div class="panel">
      <h3>量能异常（510310 沪深300）<span>低位放量=承接 / 高位放量=出货</span></h3>
      <div class="mini">
        <div class="mi"><div class="k">收盘 / 年线</div><div class="v">${F.n(v.close, 3)} / ${F.n(v.ma250, 3)}</div></div>
        <div class="mi"><div class="k">位置（vs MA250）</div><div class="v" style="color:${v.pos > 0 ? 'var(--red)' : 'var(--green)'}">${F.sign(v.pos * 100, 1)}%</div></div>
        <div class="mi"><div class="k">日量倍数</div><div class="v">${F.n(v.dK, 2)}×</div></div>
        <div class="mi"><div class="k">周量倍数</div><div class="v">${F.n(v.wK, 2)}×</div></div>
      </div>
      <div class="warn info">判定：<b>${v.level}</b> — ${v.desc}</div>
    </div>` : `<div class="panel"><h3>量能</h3><div class="err">${v.err || '数据缺失'}</div></div>`;

    return `
    <div class="panel">
      <h3>当前 RSI<span>近 5 日：${r.items[0] && r.items[0].near5 ? r.items[0].near5.map(x => x == null ? '—' : x.toFixed(1)).join(' / ') : '—'}</span></h3>
      <table><thead><tr><th>标的</th><th>收盘</th><th>RSI</th><th>分位</th><th>买/卖线</th><th>判定</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <p class="note">RSI 用后复权收盘计算（除息跳空会失真）；分位为近 250 个交易日百分位。</p>
    </div>
    <div class="panel"><h3>RSI 走势<span>近 180 个交易日 · 34 / 82 / 75 阈值</span></h3>
      <div id="cr-rsi" class="chart-t"></div></div>
    ${volBlock}`;
  },

  chart(r) {
    const it = r.items[0];
    if (!it || it.err) return null;
    return {
      id: 'cr-rsi',
      dates: it.dates,
      series: r.items.map((i, k) => ({
        name: i.label, data: i.series,
        color: ['#1f4e79', '#2e7d52', '#b42318'][k % 3]
      })),
      marks: [
        { y: 34, name: '买 34' }, { y: 82, name: '卖 82' }, { y: 75, name: '512890 卖 75' }
      ],
      yMin: 0, yMax: 100
    };
  }
};
