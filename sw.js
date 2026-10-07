/* Lexicon Legion service worker — offline app shell.
   Bump CACHE on every release so updated files reach the device. Never touches localStorage. */
const CACHE = 'lexicon-legion-v0.1.0';
const ASSETS = [
  './', './index.html', './dist/style.min.css', './dist/app.min.js', './manifest.json',
  './data/catalog.json', './data/groups/cestus-d.json',
  './icons/logo.svg', './icons/favicon-32.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './assess/', './assess/index.html', './assess/style.css', './assess/app.js', './assess/words.js',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
