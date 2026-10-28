/**
 * st_div.js — ETF 股息率
 *
 * ⚠ 这一项目前**不能实时**，原因写在明处：
 *   成分股股息率 = Σ(权重 × TTM 每股分红 / 股价)，需要 300 只成分股的分红明细。
 *   桌面端走的是东财 fundf10 + 逐只成分股抓取，那个域名没有开 CORS，
 *   浏览器里无法直连；任何"前端算股息率"的方案都得依赖第三方代理，不可靠。
 *
 * 所以这里只做两件事：
 *   1. 展示桌面端最后一次导入的快照（seed.divsnap），并明确标注截至日期；
 *   2. 画出已有记录日的走势。
 *
 * 这也是「预留拓展口」的示范：将来若找到带 CORS 的数据源，
 * 只改本文件的 refresh()，其余代码一行不用动。
 */
import { seed, F, cls } from './core.js';

const NAMES = { '515080': '中证红利', '159307': '红利低波100', '512690': '酒ETF' };

export default {
  id: 'div',
  name: 'ETF 股息率',
  sub: '成分股加权 · 桌面端导入',
  order: 40,
  exp: '⚠ 此项需桌面端每日导入，手机端无法自行刷新（成分股分红数据无 CORS 接口）',

  async refresh() {
    const s = await seed();
    const rows = s.divsnap || [];
    if (!rows.length) throw new Error('底库没有股息率快照');
    const last = rows[rows.length - 1];
    const codes = Object.keys(last.v);
    return {
      date: last.d, codes, latest: last.v,
      hist: rows,
      n: rows.length,
      stale: daysBetween(last.d),
      dim: rows.length >= 2 ? rows.slice(-1)[0].v : {}
    };
  },

  status(r) { return r.stale > 3 ? '已过期 ' + r.stale + '天' : '正常'; },
  statusCls(r) { return r.stale > 3 ? 'watch' : 'ok'; },

  kpis(r) {
    return r.codes.slice(0, 3).map(c => ({
      k: (NAMES[c] || c) + ' 成分股',
      v: F.n(r.latest[c], 2) + '%'
    }));
  },

  foot(r) {
    return `数据截至 <b>${r.date}</b>（桌面端导入）· 共 ${r.n} 个记录日` +
      (r.stale > 3 ? `　⚠ 已 ${r.stale} 天未更新` : '');
  },

  detail(r) {
    const rows = r.codes.map(c => {
      const v = r.latest[c];
      const prev = r.hist.length > 1 ? r.hist[r.hist.length - 2].v[c] : null;
      const d = (prev != null && v != null) ? v - prev : null;
      return `<tr><td>${c} ${NAMES[c] || ''}</td><td><b>${F.n(v, 2)}%</b></td>
        <td class="${cls(d)}">${d == null ? '—' : F.sign(d, 2) + 'pp'}</td>
        <td>${r.hist.filter(x => x.v[c] != null).length}</td></tr>`;
    }).join('');

    const tail = r.hist.slice(-15).slice().reverse().map(x =>
      `<tr><td>${x.d}</td>` + r.codes.map(c =>
        `<td>${x.v[c] != null ? F.n(x.v[c], 2) + '%' : '—'}</td>`).join('') + '</tr>').join('');

    return `
    <div class="panel">
      <h3>当前<span>${r.date}</span></h3>
      <table><thead><tr><th>标的</th><th>成分股股息率</th><th>环比</th><th>记录日数</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <p class="note">成分股按前 80% 权重归一化推算，分子 TTM 已冻结、只刷价格。
        <b>此项无法在手机上刷新</b>——成分股分红明细的数据源（fundf10.eastmoney.com）未开放跨域，
        浏览器拿不到。桌面端每日导入后才会有新值。</p>
    </div>
    <div class="panel">
      <h3>最近 15 个记录日<span>共 ${r.n} 个</span></h3>
      <table><thead><tr><th>日期</th>${r.codes.map(c => `<th>${NAMES[c] || c}</th>`).join('')}</tr></thead>
        <tbody>${tail}</tbody></table>
    </div>`;
  }
};

function daysBetween(d) {
  const t = new Date(d + 'T00:00:00').getTime();
  return Math.max(0, Math.round((Date.now() - t) / 864e5));
}
