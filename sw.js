/* Service Worker: アプリ本体はプリキャッシュ、音声は再生時にキャッシュ（オフライン対応） */
const VERSION = 'v1.1.0';
const CORE = `eigomimi-core-${VERSION}`;
const AUDIO = 'eigomimi-audio';
const CORE_FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css',
  './js/app.js', './js/db.js', './js/srs.js', './js/audio.js', './js/store.js', './js/util.js', './js/components.js',
  './js/dashboard.js', './js/practice.js', './js/sortgame.js', './js/quiz.js', './js/records.js', './js/settings.js', './js/curriculum.js', './js/drill.js',
  './data/curriculum.json', './data/words.json', './data/drill-words.json', './data/sample-data.json',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    // 1つ失敗しても他は入れる
    await Promise.all(CORE_FILES.map(f => c.add(f).catch(err => console.warn('precache skip', f, err))));
    // 音声は存在する分だけ先読み（母音セクション Track 26〜38、2話者）。無ければ黙ってスキップ。
    const a = await caches.open(AUDIO);
    const tracks = [];
    for (const sp of ['M', 'F']) for (let t = 26; t <= 38; t++) tracks.push(`./audio/${sp}-Practice-${String(t).padStart(2, '0')}.mp3`);
    await Promise.all(tracks.map(async url => {
      try { const res = await fetch(url); if (res.ok) await a.put(url, res); } catch { /* offline or missing */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('eigomimi-core-') && k !== CORE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.includes('/audio/')) {
    // 音声: cache-first、無ければネットワーク → キャッシュ（Range リクエストは素通し）
    if (req.headers.has('range')) return;
    e.respondWith((async () => {
      const cache = await caches.open(AUDIO);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch { return new Response('', { status: 404, statusText: 'audio not available offline' }); }
    })());
    return;
  }

  // アプリ本体: network-first（更新を素早く反映）、失敗時はキャッシュ
  e.respondWith((async () => {
    const cache = await caches.open(CORE);
    try {
      const res = await fetch(req);
      if (res.ok && (url.pathname.endsWith('.json') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname.endsWith('/'))) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return new Response('offline', { status: 503 });
    }
  })());
});
