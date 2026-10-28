/**
 * core.js — 应用内核
 * 网络（带缓存/重试/节流）、本地库（本地增量累积）、指标、格式化
 *
 * 数据流（对应 2026-10-28 的设计要求）
 *   seed.json（桌面端预置的历史底库）
 *     └─ 首次打开写入本地库
 *          └─ 每次刷新：只拉最近 60 根，把 seed 末日之后的补进来
 *               └─ 本地库越用越长，不依赖桌面端
 *
 * 口径铁律
 *   · 指标一律用 hf 字段（存的是**前复权**序列）：不复权价在除息日跳空，RSI 会被打成假信号。
 *     为什么不用后复权：桌面端 rsi_monitor.py 走腾讯 qfq，同一天三种口径分别是
 *     raw 47.96 / qfq 47.58 / hfq 48.66 —— 差 1 点足以让 34 附近的信号翻转，必须与桌面同源。
 *   · 显示一律用 c（不复权）：用户看到的价格必须是真实报价。
 *   · 前复权每遇一次分红会重写全部历史，所以每次刷新都要做重算检测：
 *     重叠段 hf 比值变化 > 0.3% → 判定发生分红 → 拉全量覆盖，避免拼接处出现台阶。
 */

const SEED_URL = './seed.json';
const LS_SEED = 'hub_seed_v1';
const LS_KL = 'hub_kl_';
const LS_SNAP = 'hub_snap_';
const LS_META = 'hub_meta_v1';

export const cfg = {
  refreshKline: 60,        // 日常只补最近 60 根
  fullKline: 800,          // 兜底全量
  ttlQuote: 60e3,          // 报价缓存 60 秒
  ttlKline: 5 * 60e3,      // 日线缓存 5 分钟（盘中可手动刷）
};

/* ---------------------------------------------------------------- 本地库 */
function lsGet(k) {
  try {
    const s = localStorage.getItem(k);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e) {
    if (String(e).indexOf('quota') >= 0) {
      // 容量满：清掉最旧的策略快照，保住日线库
      Object.keys(localStorage).filter(k2 => k2.indexOf(LS_SNAP) === 0)
        .forEach(k2 => localStorage.removeItem(k2));
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e2) { }
    }
    return false;
  }
}
export const store = {
  get: lsGet, set: lsSet,
  meta() { return lsGet(LS_META) || {}; },
  setMeta(k, v) { const m = lsGet(LS_META) || {}; m[k] = v; lsSet(LS_META, m); },
  clear() {
    Object.keys(localStorage).filter(k => k.indexOf('hub_') === 0 && k !== LS_SEED)
      .forEach(k => localStorage.removeItem(k));
  }
};

/* ---------------------------------------------------------------- 种子 */
let _seed = null;
export async function seed() {
  if (_seed) return _seed;
  const cached = lsGet(LS_SEED);
  const meta = lsGet(LS_META) || {};
  // 缓存里有、且不比线上新时，直接用缓存（省一次 39 KB 下载）
  if (cached && cached._at && !meta.seedStale) { _seed = cached; return _seed; }
  try {
    const r = await fetch(SEED_URL + '?t=' + Date.now());
    const j = await r.json();
    j._at = Date.now();
    lsSet(LS_SEED, j);
    store.setMeta('seedStale', false);
    _seed = j;
  } catch (e) {
    if (cached) { _seed = cached; }
    else throw new Error('基础底库加载失败：' + e.message);
  }
  return _seed;
}

/* ---------------------------------------------------------------- 网络 */
const _last = {};                       // 同域节流
async function jget(url, { retries = 3, gap = 350, ms = 15000 } = {}) {
  let err;
  for (let i = 0; i < retries; i++) {
    try {
      const host = url.split('/')[2];
      const wait = (_last[host] || 0) + gap - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      _last[host] = Date.now();

      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), ms);
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      return JSON.parse(txt);
    } catch (e) {
      err = e;
      await new Promise(r => setTimeout(r, 400 * (i + 1) * (i + 1)));
    }
  }
  throw err;
}

/** 腾讯日线。kind: '' 不复权 / 'qfq' 前复权 / 'hfq' 后复权 */
export async function txKline(sym, n = 60, kind = '') {
  const u = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},day,,,${n},${kind}`;
  const j = await jget(u);
  const node = (j.data || {})[sym] || {};
  const rows = node[(kind || '') + 'day'] || node.day || [];
  const out = { d: [], o: [], h: [], l: [], c: [], v: [] };
  for (const it of rows) {
    if (!it || it.length < 6) continue;
    out.d.push(it[0]);
    out.o.push(+it[1]);
    out.c.push(+it[2]);
    out.h.push(+it[3]);
    out.l.push(+it[4]);
    out.v.push(+it[5]);
  }
  return out;
}

/** 腾讯批量报价（GBK 编码，需手工解码）。syms: ['sh510300','sh000300'] */
export async function txQuote(syms) {
  const u = 'https://qt.gtimg.cn/q=' + syms.join(',');
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = await r.arrayBuffer();
  let txt;
  try { txt = new TextDecoder('gbk').decode(buf); }
  catch (e) { txt = new TextDecoder('utf-8').decode(buf); }
  const out = {};
  for (const line of txt.split(';')) {
    const m = line.match(/v_(\w+)="([^"]*)"/);
    if (!m) continue;
    const f = m[2].split('~');
    if (f.length < 6) continue;
    out[m[1]] = {
      sym: m[1], name: f[1], code: f[2],
      px: +f[3] || null, prev: +f[4] || null, open: +f[5] || null,
      chg: f[4] ? (+f[3] / +f[4] - 1) * 100 : null,
      time: f[30] || ''
    };
  }
  if (!Object.keys(out).length) throw new Error('报价解析为空');
  return out;
}

/** 东财批量行情（唯一开了 CORS 的口径）。字段：f2 价 / f12 代码 / f14 名 / f84 份额(份) */
export async function emQuote(secids) {
  const u = 'https://push2.eastmoney.com/api/qt/ulist.np/get?secids=' + secids.join(',') +
    '&fields=f2,f3,f12,f14,f84,f85&_=' + Date.now();
  const j = await jget(u);
  const diff = (j.data || {}).diff;
  if (!diff) throw new Error('行情接口无数据');
  return diff.map(x => ({
    code: x.f12, name: x.f14,
    px: x.f2 > 0 ? x.f2 / 1000 : null,     // 东财 f2 是「分×10」的整数
    chg: x.f3 != null && x.f3 !== '-' ? x.f3 / 100 : null,
    shares: x.f84 > 0 ? x.f84 / 1e8 : null, // 份 → 亿份
    mcap: x.f85 > 0 ? x.f85 / 1e8 : null
  }));
}

/* ---------------------------------------------------------------- 日线同步 */
/**
 * 取某标的的完整日线（本地库 + 增量）。
 * 返回 { d, c, hf, v, src:'seed'|'net'|'mixed', newDays }
 */
export async function syncKline(code) {
  const s = await seed();
  const base = s.kl[code];
  if (!base) throw new Error('底库没有 ' + code);

  const key = LS_KL + code;
  let cur = lsGet(key);
  if (!cur || !cur.d || !cur.d.length) {
    cur = {
      s: base.s, n: base.n,
      d: base.d.slice(), o: (base.o || base.c).slice(), h: (base.h || base.c).slice(),
      l: (base.l || base.c).slice(), c: base.c.slice(),
      hf: base.hf.slice(), v: (base.v || []).slice()
    };
  }
  const lastDay = cur.d[cur.d.length - 1];

  let step = await txKline(cur.s, cfg.refreshKline, '').catch(() => null);
  let hstep = await txKline(cur.s, cfg.refreshKline, 'qfq').catch(() => null);
  let newDays = 0, src = 'seed';

  if (step && step.d.length) {
    // 分红重算检测：重叠 5 天的 hf 比值是否有偏移
    if (hstep && hstep.d.length) {
      const hm = new Map(hstep.d.map((d, i) => [d, hstep.c[i]]));
      let a = 0, b = 0;
      for (let i = cur.d.length - 1, n = 0; i >= 0 && n < 5; i--, n++) {
        if (hm.has(cur.d[i])) { a += hm.get(cur.d[i]); b += cur.hf[i]; }
      }
      if (b > 0 && Math.abs(a / b - 1) > 0.003) {
        // 发生分红 → 全量覆盖，保证口径一致
        const full = await txKline(cur.s, cfg.fullKline, '').catch(() => null);
        const fullH = await txKline(cur.s, cfg.fullKline, 'qfq').catch(() => null);
        if (full && full.d.length && fullH) {
          const fm = new Map(fullH.d.map((d, i) => [d, fullH.c[i]]));
          cur = {
            s: cur.s, n: cur.n,
            d: full.d, o: full.o, h: full.h, l: full.l, c: full.c,
            hf: full.d.map((d, i) => fm.has(d) ? fm.get(d) : full.c[i]),
            v: full.v
          };
          lsSet(key, cur);
          return { ...cur, src: 'net', newDays: 0, rebuilt: true };
        }
      }
    }

    const hm = new Map((hstep || { d: [], c: [] }).d.map((d, i) => [d, hstep.c[i]]));
    const idx = new Map(cur.d.map((d, i) => [d, i]));
    for (let i = 0; i < step.d.length; i++) {
      const d = step.d[i];
      const hf = hm.has(d) ? hm.get(d) : step.c[i];
      if (idx.has(d)) {
        const j = idx.get(d);
        cur.o[j] = step.o[i]; cur.h[j] = step.h[i]; cur.l[j] = step.l[i];
        cur.c[j] = step.c[i];
        cur.hf[j] = hf;                      // 重叠段永远取最新
        cur.v[j] = step.v[i];
      } else if (d > lastDay) {
        cur.d.push(d); cur.o.push(step.o[i]); cur.h.push(step.h[i]); cur.l.push(step.l[i]);
        cur.c.push(step.c[i]); cur.hf.push(hf); cur.v.push(step.v[i]);
        newDays++;
      }
    }
    src = 'mixed';
    lsSet(key, cur);
  }
  return { ...cur, src, newDays, rebuilt: false };
}

/* ---------------------------------------------------------------- 指标 */
export function MA(a, n) {
  const out = new Array(a.length).fill(null);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= n) s -= a[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

/** Wilder RSI，与 Python 实现一致（首值用简单均值，之后递推） */
export function RSI(a, n = 14) {
  const out = new Array(a.length).fill(null);
  if (a.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = a[i] - a[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < a.length; i++) {
    const d = a[i] - a[i - 1];
    const up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
    g = (g * (n - 1) + up) / n;
    l = (l * (n - 1) + dn) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

/** v 在过去 n 个值中的百分位（0~100） */
export function pctRank(arr, v, n = 250) {
  const w = arr.filter(x => x != null).slice(-n);
  if (!w.length) return null;
  let k = 0;
  for (const x of w) if (x <= v) k++;
  return k / w.length * 100;
}

/* ---------------------------------------------------------------- 格式化 */
export const F = {
  n(v, d = 2) { return v == null || isNaN(v) ? '—' : (+v).toFixed(d); },
  sign(v, d = 2) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + (+v).toFixed(d);
  },
  pct(v, d = 2) { return v == null || isNaN(v) ? '—' : (+v).toFixed(d) + '%'; },
  int(v) { return v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('en-US'); },
  yi(v) { return v == null || isNaN(v) ? '—' : (Math.round(v)).toLocaleString('en-US'); },
  esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};

export function cls(v) { return v == null ? '' : (v >= 0 ? 'pos' : 'neg'); }

export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
