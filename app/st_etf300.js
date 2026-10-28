/**
 * st_etf300.js — 300ETF 国家队资金占比
 *
 * 口径（与 300etf_daily.py 一致）
 *   规模 = Σ(四只 ETF 份额 × 收盘价)
 *   分母 = K × 沪深300点位，K = 56.9292 亿元/点（中证指数 2026-10-26 自由流通市值快照）
 *   占比 = 规模 / 分母
 *
 * 数据源优先级
 *   价格/指数：腾讯 qt.gtimg.cn（稳定，无限流）
 *   份额：东财 f84（有 CORS，但限流较严）→ 失败时按指数变动推算规模，并明确标注
 */
import { txQuote, emQuote, seed, F, cls } from './core.js';

const ETFS = [
  { code: '510300', sym: 'sh510300', secid: '1.510300', name: '华泰柏瑞' },
  { code: '510310', sym: 'sh510310', secid: '1.510310', name: '易方达' },
  { code: '510330', sym: 'sh510330', secid: '1.510330', name: '华夏' },
  { code: '159919', sym: 'sz159919', secid: '0.159919', name: '嘉实' }
];
const K_DEFAULT = 56.9292;

export default {
  id: 'etf300',
  name: '300ETF 国家队',
  sub: '四只头部合计 / 沪深300 自由流通市值',
  order: 30,
  exp: '口径：份额含全部持有人，不等于汇金一家；分母系数随自由流通股本漂移',

  async refresh() {
    const s = await seed();
    const k = (s.x300 && s.x300.k) || K_DEFAULT;

    // 价格与指数（腾讯，稳定）
    const q = await txQuote([...ETFS.map(e => e.sym), 'sh000300']);
    const idx = q.sh000300;
    if (!idx || !idx.px) throw new Error('沪深300 指数取数失败');

    // 份额（东财，失败可降级）
    let sh = {}, shSrc = 'eastmoney';
    try {
      const em = await emQuote(ETFS.map(e => e.secid));
      for (const it of em) if (it.shares) sh[it.code] = it.shares;
      if (Object.keys(sh).length < 4) shSrc = 'partial';
    } catch (e) {
      shSrc = 'fallback';
    }

    const last = (s.x300.rows || []).slice(-1)[0];
    const prod = [];
    let scale = 0;

    for (const e of ETFS) {
      const p = q[e.sym];
      const px = p && p.px ? p.px : null;
      const share = sh[e.code] || null;
      prod.push({ code: e.code, name: e.name, px, shares: share,
        scale: (px && share) ? px * share : null, src: share ? 'em' : 'none' });
    }

    const full = prod.every(p => p.scale);
    let derived = false, note = '';

    if (full) {
      scale = prod.reduce((a, p) => a + p.scale, 0);
    } else if (last) {
      // 份额接口不可用：按「上一记录日规模 × 指数涨跌」推算。
      // 这比用季报份额准得多——季报只到 09-30，而 10 月单月份额涨了 59%。
      derived = true;
      shSrc = 'derived';
      scale = last[2] * (idx.px / last[4]);
      note = `份额接口不可用，按上一记录日（${last[0]}）规模 ${F.yi(last[2])} 亿 × 指数变动推算`;
      prod.forEach(p => { p.scale = null; p.shares = null; });
    } else {
      // 连历史都没有，只能用季报份额
      shSrc = 'quarterly';
      for (const e of ETFS) {
        const q4 = (s.shares && s.shares[e.code]) || [];
        if (!q4.length) continue;
        const p = prod.find(x => x.code === e.code);
        p.shares = q4[q4.length - 1][1];
        p.src = 'q';
        if (p.px) { p.scale = p.px * p.shares; scale += p.scale; }
      }
      note = '东财份额不可用，且无历史记录，只能用季报份额推算（偏差可能较大）';
    }
    if (!scale) throw new Error('规模取不到');

    const denom = k * idx.px;
    const ratio = scale / denom * 100;

    // 历史序列：底库 + 今日
    const rows = (s.x300.rows || []).slice();
    const today = new Date().toISOString().slice(0, 10);
    const lastRow = rows[rows.length - 1];
    const merged = rows.slice();
    if (!lastRow || lastRow[0] !== today) {
      merged.push([today, +ratio.toFixed(4), +scale.toFixed(1), null, +idx.px.toFixed(2)]);
    } else {
      merged[merged.length - 1] = [today, +ratio.toFixed(4), +scale.toFixed(1),
        lastRow[3], +idx.px.toFixed(2)];
    }

    const prev = last;
    return {
      date: today, ratio, scale, index: idx.px, k, denom,
      shares: full ? prod.reduce((a, p) => a + (p.shares || 0), 0) : (last ? last[3] : 0),
      prevRatio: prev ? prev[1] : null,
      dRatio: prev ? ratio - prev[1] : null,
      dScale: prev ? scale - prev[2] : null,
      prod, shSrc, derived, note,
      hist: merged.slice(-120),
      nHist: merged.length
    };
  },

  status(r) { return r.shSrc === 'em' ? '正常' : '份额降级'; },
  statusCls(r) { return r.shSrc === 'em' ? 'ok' : 'watch'; },

  kpis(r) {
    return [
      { k: '占比', v: F.n(r.ratio, 2) + '%', s: r.dRatio == null ? '' : ' ' + F.sign(r.dRatio, 2) + 'pp' },
      { k: '规模', v: F.yi(r.scale) + '亿' },
      { k: '份额', v: F.n(r.shares, 0) + '亿份' }
    ];
  },

  foot(r) {
    const note = r.note ? `　⚠ ${r.note}` : '';
    return `沪深300 <b>${F.n(r.index, 0)}</b> 点 · 分母 ${F.n(r.k, 2)} 亿/点${note}`;
  },

  detail(r) {
    const rows = r.prod.map(p => `<tr><td>${p.code} ${p.name}</td><td>${F.n(p.px, 3)}</td>
      <td>${p.shares ? F.n(p.shares, 1) : '—'}${p.src === 'q' ? '<span class="tag">季报</span>' : ''}</td>
      <td>${p.scale ? F.yi(p.scale) : '—'}</td>
      <td>${p.scale ? F.n(p.scale / r.scale * 100, 1) + '%' : '—'}</td></tr>`).join('');

    const tail = r.hist.slice(-20).slice().reverse().map((x, i) => {
      const p = r.hist[r.hist.length - 1 - i - 1];
      const dr = p ? x[1] - p[1] : null;
      return `<tr><td>${x[0]}</td><td>${F.n(x[1], 2)}%</td>
        <td class="${cls(dr)}">${dr == null ? '—' : F.sign(dr, 2) + 'pp'}</td>
        <td>${F.yi(x[2])}</td><td>${F.n(x[4], 0)}</td></tr>`;
    }).join('');

    const warn = r.note ? `<div class="warn">⚠ ${F.esc(r.note)}</div>` : '';

    return `
    <div class="panel">
      <div class="mini">
        <div class="mi"><div class="k">占比</div><div class="v">${F.n(r.ratio, 2)}%</div></div>
        <div class="mi"><div class="k">规模</div><div class="v">${F.yi(r.scale)} 亿</div></div>
        <div class="mi"><div class="k">沪深300</div><div class="v">${F.n(r.index, 0)}</div></div>
        <div class="mi"><div class="k">分母</div><div class="v">${F.yi(r.denom)} 亿</div></div>
      </div>
      ${warn}
      <p class="note">分母 = <b>${F.n(r.k, 2)} 亿元/点</b> × 指数点位。份额口径含全部持有人，<b>不等于汇金一家</b>。</p>
    </div>
    <div class="panel">
      <h3>四只产品拆分<span>份额来源：${r.shSrc === 'em' ? '东财实时' : '降级'}</span></h3>
      <table><thead><tr><th>产品</th><th>价格</th><th>份额(亿)</th><th>规模(亿)</th><th>占比</th></tr></thead>
        <tbody>${rows}</tbody></table>
    </div>
    <div class="panel">
      <h3>最近 20 个记录日<span>底库 ${r.nHist} 条</span></h3>
      <table><thead><tr><th>日期</th><th>占比</th><th>环比</th><th>规模(亿)</th><th>指数</th></tr></thead>
        <tbody>${tail}</tbody></table>
    </div>`;
  },

  spark(r) { return r.hist.map(x => x[1]); }
};
