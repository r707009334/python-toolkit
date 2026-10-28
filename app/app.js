/**
 * app.js — 主流程
 * 只按接口调用 registry 里的策略，不认识任何具体策略。
 */
import { STRATEGIES } from './registry.js';
import { seed, F, store, today } from './core.js';

const S = { data: {}, err: {}, busy: false, last: null, view: 'sum' };
const $ = s => document.querySelector(s);

/* ---------------------------------------------------------------- 刷新 */
async function refreshAll(force) {
  if (S.busy) return;
  S.busy = true;
  paintTop();
  const t0 = Date.now();

  await Promise.all(STRATEGIES.map(async st => {
    try {
      S.data[st.id] = await st.refresh();
      S.err[st.id] = null;
    } catch (e) {
      S.err[st.id] = (e && e.message) || String(e);
    }
  }));

  S.last = new Date();
  store.setMeta('lastRefresh', S.last.getTime());
  S.busy = false;
  paintTop();
  renderCards();
  if (S.view !== 'sum') openDetail(S.view, true);
}

function paintTop() {
  const el = $('#stamp');
  const now = new Date();
  const secs = S.last ? Math.round((Date.now() - S.last.getTime()) / 1000) : null;
  el.innerHTML =
    (S.busy ? '<span class="spin"></span>更新中…' : (S.last ? `更新于 ${hhmm(S.last)}` : '未更新')) +
    `<br><span class="dim">${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    (secs != null && secs > 90 ? `　${Math.round(secs / 60)} 分钟前` : '') + '</span>';
}

/* ---------------------------------------------------------------- 卡片 */
function renderCards() {
  const box = $('#cards');
  box.innerHTML = STRATEGIES.map(st => {
    const d = S.data[st.id], e = S.err[st.id];
    if (e) {
      return `<div class="card s-err" data-id="${st.id}">
        <div class="ch"><div class="ct">${F.esc(st.name)}<i>${F.esc(st.sub || '')}</i></div>
          <span class="badge b-err">异常</span></div>
        <div class="err">${F.esc(e)}</div>
        <div class="cf"><div class="cl">点开看详情，或再刷新一次</div><span class="go">详情</span></div>
      </div>`;
    }
    if (!d) {
      return `<div class="card s-wait"><div class="ch"><div class="ct">${F.esc(st.name)}</div>
        <span class="badge b-wait">待更新</span></div>
        <div class="kpis"><div class="kp"><div class="k">状态</div><div class="v">—</div></div></div></div>`;
    }
    const cls = (st.statusCls && st.statusCls(d)) || 'ok';
    const stt = (st.status && st.status(d)) || '正常';
    const kp = (st.kpis ? st.kpis(d) : []).map(k =>
      `<div class="kp"><div class="k">${F.esc(k.k)}</div><div class="v">${k.v || '—'}` +
      (k.s ? `<small>${k.s}</small>` : '') + '</div></div>').join('');
    const sp = st.spark ? sparkSVG(st.spark(d)) : '';
    return `<div class="card s-${cls}" data-id="${st.id}">
      <div class="ch"><div class="ct">${F.esc(st.name)}<i>${F.esc(st.sub || '')}</i></div>
        <span class="badge b-${cls}">${F.esc(stt)}</span></div>
      <div class="kpis">${kp}</div>
      ${sp ? `<div class="spl"><span class="cap">近 120 日</span>${sp}</div>` : ''}
      ${st.exp ? `<div class="exp">${st.exp}</div>` : ''}
      <div class="cf"><div class="cl">${st.foot ? st.foot(d) : ''}</div><span class="go">详情</span></div>
    </div>`;
  }).join('');

  box.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', () => openDetail(c.dataset.id));
  });
}

/* ---------------------------------------------------------------- 详情 */
function openDetail(id, inPlace) {
  const st = STRATEGIES.find(x => x.id === id);
  if (!st) return;
  S.view = id;
  const d = S.data[id], e = S.err[id];

  $('#sum').classList.remove('on');
  const v = $('#detail');
  v.classList.add('on');

  let body;
  if (e) body = `<div class="panel"><div class="err">${F.esc(e)}</div></div>`;
  else if (!d) body = `<div class="panel"><div class="err">还没取到数据，返回刷新一次</div></div>`;
  else body = st.detail(d);

  v.innerHTML = `
    <div class="dbar">
      <button class="back" id="btnBack">← 返回</button>
      <div class="dtitle">${F.esc(st.name)}<small>${F.esc(st.sub || '')}</small></div>
    </div>
    ${body}
    <div class="footbtns"><button class="ghost" id="btnUpd">重新获取此项</button></div>`;

  $('#btnBack').onclick = () => {
    S.view = 'sum';
    v.classList.remove('on');
    $('#sum').classList.add('on');
    window.scrollTo(0, 0);
  };
  $('#btnUpd').onclick = async () => {
    const b = $('#btnUpd');
    b.disabled = true; b.textContent = '取数中…';
    try {
      S.data[id] = await st.refresh();
      S.err[id] = null;
    } catch (err) {
      S.err[id] = (err && err.message) || String(err);
    }
    openDetail(id);
    renderCards();
  };

  if (!inPlace) window.scrollTo(0, 0);

  if (d && st.chart) {
    const c = st.chart(d);
    if (c) {
      const host = document.getElementById(c.id);
      if (host) host.innerHTML = lineSVG(c);
    }
  }
}

/* ---------------------------------------------------------------- 图 */
function pad(n) { return String(n).padStart(2, '0'); }
function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

function sparkSVG(vals) {
  const a = vals.filter(v => v != null);
  if (a.length < 2) return '';
  const w = 300, h = 34, mn = Math.min(...a), mx = Math.max(...a);
  const sp = mx - mn || 1;
  const pts = a.map((v, i) =>
    `${(i / (a.length - 1) * w).toFixed(1)},${(h - 3 - (v - mn) / sp * (h - 6)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spk">
    <polyline points="${pts}" fill="none" stroke="#1f4e79" stroke-width="1.6"
     vector-effect="non-scaling-stroke"/></svg>`;
}

function lineSVG(c) {
  const W = 640, H = 260, L = 34, R = 46, T = 12, B = 24;
  const pts = [];
  c.series.forEach(s => s.data.forEach(v => { if (v != null) pts.push(v); }));
  if (!pts.length) return '';
  let mn = c.yMin != null ? c.yMin : Math.min(...pts);
  let mx = c.yMax != null ? c.yMax : Math.max(...pts);
  if (mx - mn < 1) mx = mn + 1;

  const xs = i => L + i / Math.max(1, c.dates.length - 1) * (W - L - R);
  const ys = v => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);

  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = mn + (mx - mn) * k / 4, y = ys(v);
    grid += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${W - R}" y2="${y.toFixed(1)}"
      stroke="#eef1f5" stroke-width="1"/>
      <text x="${L - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end"
       font-size="9" fill="#9aa3af">${v.toFixed(0)}</text>`;
  }

  let marks = '';
  (c.marks || []).forEach(m => {
    if (m.y < mn || m.y > mx) return;
    const y = ys(m.y);
    marks += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${W - R}" y2="${y.toFixed(1)}"
      stroke="#cbd5e1" stroke-dasharray="3 3" stroke-width="1"/>
      <text x="${W - R + 5}" y="${(y + 3.5).toFixed(1)}" font-size="9"
       fill="#6b7280">${F.esc(m.name)}</text>`;
  });

  const paths = c.series.map(s => {
    let d = '', open = false;
    s.data.forEach((v, i) => {
      if (v == null) { open = false; return; }
      d += (open ? 'L' : 'M') + xs(i).toFixed(1) + ',' + ys(v).toFixed(1);
      open = true;
    });
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.7"/>`;
  }).join('');

  let xlab = '';
  const step = Math.max(1, Math.floor(c.dates.length / 5));
  for (let i = 0; i < c.dates.length; i += step) {
    xlab += `<text x="${xs(i).toFixed(1)}" y="${H - 6}" font-size="9" fill="#9aa3af"
      text-anchor="middle">${c.dates[i].slice(5)}</text>`;
  }

  const legend = c.series.map((s, i) =>
    `<g transform="translate(${L + i * 78},${H + 10})">
      <rect width="8" height="8" y="-6" fill="${s.color}" rx="2"/>
      <text x="11" y="2" font-size="9.5" fill="#4b5563">${F.esc(s.name)}</text></g>`).join('');

  return `<svg viewBox="0 0 ${W} ${H + 18}" class="ln">
    ${grid}${marks}${paths}${xlab}${legend}</svg>`;
}

/* ---------------------------------------------------------------- 启动 */
async function boot() {
  $('#btnRefresh').onclick = () => refreshAll(true);

  try {
    const s = await seed();
    const built = (s.built || '').slice(0, 10);
    $('#seedInfo').textContent = '底库 ' + built;
  } catch (e) {
    $('#seedInfo').textContent = '底库加载失败';
  }

  const lastTs = store.meta().lastRefresh;
  if (lastTs) S.last = new Date(lastTs);
  paintTop();

  await refreshAll(false);

  setInterval(() => { if (!S.busy) paintTop(); }, 30000);

  // service worker（离线壳）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { });
  }
}

document.addEventListener('DOMContentLoaded', boot);
