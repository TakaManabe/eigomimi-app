/* 母音ドリル Service Worker: 全ファイルをプリキャッシュ、network-first で更新 */
const VERSION = 'drill-v2.1.0';
const FILES = ['./', './index.html', './app.js', './manifest.webmanifest', './data/drill-words.json', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
    catch { return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('./index.html') : new Response('offline', { status: 503 })); }
  })());
});
