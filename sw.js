/* Keeps the app shell available so it opens fast and shows a page even with bad signal.
   Always tries the network first, so updates show up right away. Never touches database or photo requests. */
const CACHE = 'bc-shell-202610160300';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  /* the page itself is always re-checked with the server, so a new version shows up on the next open */
  const net = e.request.mode === 'navigate' ? fetch(e.request.url, {cache: 'no-cache', credentials: 'same-origin'}) : fetch(e.request);
  e.respondWith(net.then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, {ignoreSearch: true}).then((r) => r || caches.match('index.html'))));
});
