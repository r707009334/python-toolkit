/**
 * sw.js — 离线壳
 *
 * 只缓存同源的静态文件；行情接口（腾讯 / 东财）一律不缓存，
 * 否则会拿到过期报价。seed.json 走「网络优先」，保证底库能更新。
 *
 * 改前端代码后请把 V 加一，否则手机上会一直用旧缓存。
 */
const V = 'hub-v5';
const SHELL = [
  './', './index.html', './app.js', './core.js', './registry.js',
  './st_grid.js', './st_rsi.js', './st_etf300.js', './st_div.js',
  './manifest.json', './icon-180.png', './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;      // 行情接口不接管

  if (u.pathname.endsWith('seed.json')) {
    e.respondWith(
      fetch(req).then(r => {
        const cp = r.clone();
        caches.open(V).then(c => c.put(req, cp));
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      const cp = r.clone();
      caches.open(V).then(c => c.put(req, cp));
      return r;
    }).catch(() => hit))
  );
});
