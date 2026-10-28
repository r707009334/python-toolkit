/**
 * st_grid.js — 515080 中证红利 · 网格 + 下跌重校
 *
 * 与 D:/量化/strategies/515080_daily_ma30.py 的 run() 逐行对齐：
 *   · 参数 N=24 / S=0.5% / D=2.5% / rec=1.5% / MA30 / FEE=0.5bp
 *   · 跨格用当日高（卖）/ 低（买）判断，不是收盘价
 *   · 起点必须与回测一致（2024-08-09，15 格起步），否则路径依赖会让格位不同
 *   · 网格用**不复权价** + 分红入现金池（分红不是价格调整，是真实现金）
 */
import { syncKline, seed, MA, F, cls } from './core.js';

const N = 24, S = 0.005, D = 0.025, REC = 0.015, MAW = 30, FEE = 0.00005;
const START = '2024-08-09';

function runGrid(k, divs) {
  const dm = new Map(divs || []);
  const ix = [];
  for (let i = 0; i < k.d.length; i++) if (k.d[i] >= START) ix.push(i);
  if (!ix.length) throw new Error('日线未覆盖 ' + START);

  const d = ix.map(i => k.d[i]);
  const o = ix.map(i => k.o[i]);
  const h = ix.map(i => k.h ? k.h[i] : k.c[i]);
  const l = ix.map(i => k.l ? k.l[i] : k.c[i]);
  const c = ix.map(i => k.c[i]);
  // 腾讯接口不含最高/最低时会退化成收盘价，这里补一份真实高低
  const maFull = MA(c, MAW);

  const px0 = c[0];
  let unit = (1 / N) / px0;
  let shares = 15 * unit;
  let cash = 1 - shares * px0;
  let held = 15, center = px0, level = 0;
  let below = false, lowest = null, enterD = null, enterPx = null;
  let trades = 0;
  const events = [];

  for (let i = 0; i < d.length; i++) {
    if (dm.has(d[i])) cash += shares * dm.get(d[i]);

    while (held > 0 && shares >= unit - 1e-12) {
      const P = center * Math.pow(1 + S, level + 1);
      if (h[i] < P) break;
      cash += unit * P * (1 - FEE);
      shares -= unit; held--; level++; trades++;
    }
    while (held < N) {
      const P = center * Math.pow(1 + S, level - 1);
      if (l[i] > P) break;
      const cost = unit * P * (1 + FEE);
      if (cash < cost) break;
      cash -= cost; shares += unit; held++; level--; trades++;
    }

    if (i >= MAW - 1) {
      const ma = maFull[i];
      const thr = ma * (1 - D);
      if (!below) {
        if (c[i] < thr) { below = true; lowest = c[i]; enterD = d[i]; enterPx = c[i]; }
      } else if (c[i] < thr) {
        lowest = Math.min(lowest, c[i]);
      } else {
        if (c[i] >= lowest * (1 + REC)) {
          const cashBefore = cash;
          if (cash > 0) { shares += cash * (1 - FEE) / c[i]; cash = 0; trades++; }
          held = N;
          unit = shares / N;
          center = c[i]; level = 0;
          events.push({
            d: d[i], px: c[i], low: lowest, enter: enterD, enterPx,
            reb: (c[i] / lowest - 1) * 100, dd: (lowest / enterPx - 1) * 100,
            cash: cashBefore * 100
          });
        }
        below = false; lowest = null;
      }
    }
  }

  const i0 = d.length - 1;
  const close = c[i0];
  const ma = maFull[i0];
  const thr = ma * (1 - D);
  const center0 = center;
  const up = center0 * Math.pow(1 + S, level + 1);
  const dn = center0 * Math.pow(1 + S, level - 1);
  const trig = below ? lowest * (1 + REC) : null;

  return {
    date: d[i0], close, ma, thr, held, cash: cash * 100, level, center: center0,
    up, dn, upGap: (up / close - 1) * 100, dnGap: (dn / close - 1) * 100,
    below, lowest, enterD, trig, trigGap: trig ? (trig / close - 1) * 100 : null,
    gapThr: (close / thr - 1) * 100, trades, events: events.slice(-5).reverse(),
    nEvents: events.length, nbars: d.length, span: d[0] + ' ~ ' + d[i0],
    px0, curveEnd: cash + shares * close,
    from: d[0]
  };
}

export default {
  id: 'grid',
  name: '515080 网格重校',
  sub: '日线 MA30 · N24/S0.5%/D2.5%',
  order: 10,
  exp: '回测预期 年化 13.1% · 超额 +3.1pp（起点均值，规划 +2.9~3.1）· 回撤砍半',

  async refresh() {
    const [k, s] = await Promise.all([syncKline('515080'), seed()]);
    return runGrid(k, s.divs['515080'] || []);
  },

  status(r) { return r.below ? '观察中' : '正常'; },
  statusCls(r) { return r.below ? 'watch' : 'ok'; },

  kpis(r) {
    return [
      { k: '收盘 / MA30', v: F.n(r.close, 3) + '/' + F.n(r.ma, 3) },
      { k: '高于观察线', v: F.sign(r.gapThr, 2) + '%' },
      { k: '持仓 / 格位', v: r.held + '/24 · L' + (r.level >= 0 ? '+' : '') + r.level }
    ];
  },

  foot(r) {
    return r.below
      ? `观察中：${r.enterD} 起跌破，最低 ${F.n(r.lowest, 3)}，反弹到 <b>${F.n(r.trig, 3)}</b> 触发（距 ${F.sign(r.trigGap, 2)}%）`
      : `需跌到 ${F.n(r.thr, 3)} 才进入观察　明日挂单 <b>卖 ${F.n(r.up, 4)}</b> / <b>买 ${F.n(r.dn, 4)}</b>`;
  },

  detail(r) {
    const ev = r.events.length ? r.events.map(e =>
      `<tr><td>${e.d}</td><td>${F.n(e.px, 3)}</td><td>${F.n(e.low, 3)}</td>
       <td class="pos">+${F.n(e.reb, 2)}%</td><td class="${e.dd < -3 ? 'neg' : ''}">${F.n(e.dd, 2)}%</td></tr>`).join('')
      : '<tr><td colspan="5">暂无</td></tr>';

    return `
    <div class="panel">
      <div class="mini">
        <div class="mi"><div class="k">收盘 / MA30 / 阈值</div><div class="v">${F.n(r.close, 3)} / ${F.n(r.ma, 3)} / ${F.n(r.thr, 3)}</div></div>
        <div class="mi"><div class="k">状态</div><div class="v" style="color:${r.below ? 'var(--amber)' : 'var(--blue)'}">${this.status(r)}</div></div>
        <div class="mi"><div class="k">持仓 / 现金</div><div class="v">${r.held}/24 · ${F.n(r.cash, 1)}%</div></div>
        <div class="mi"><div class="k">累计成交</div><div class="v">${r.trades}</div></div>
      </div>
      ${r.below ? `<div class="warn">⚠ 观察中：${r.enterD} 起跌破，最低 <b>${F.n(r.lowest, 3)}</b>，反弹到 <b>${F.n(r.trig, 3)}</b> 触发重校（距 <b>${F.sign(r.trigGap, 2)}%</b>）</div>` : ''}
    </div>
    <div class="panel">
      <h3>明日挂单<span>成交价 = 格线价，一天穿几格成交几份</span></h3>
      <table><thead><tr><th>方向</th><th>价位</th><th>距收盘</th></tr></thead><tbody>
        <tr><td>卖出 L${r.level + 1}</td><td>${F.n(r.up, 4)}</td><td class="${cls(r.upGap)}">${F.sign(r.upGap, 2)}%</td></tr>
        <tr><td>买入 L${r.level - 1}</td><td>${F.n(r.dn, 4)}</td><td class="${cls(-r.dnGap)}">${F.sign(r.dnGap, 2)}%</td></tr>
      </tbody></table>
      <p class="note">中心价 <b>${F.n(r.center, 4)}</b> · 格位 <b>${r.level >= 0 ? '+' : ''}${r.level}</b>
        · 推演区间 ${r.span}（${r.nbars} 根）· 全期 ${r.nEvents} 次重校</p>
    </div>
    <div class="panel">
      <h3>最近重校事件<span>最近 5 次 · 反弹 ≥ 1.5% 才确认</span></h3>
      <table><thead><tr><th>日期</th><th>重校价</th><th>最低</th><th>反弹</th><th>跌破幅度</th></tr></thead>
        <tbody>${ev}</tbody></table>
    </div>`;
  }
};
