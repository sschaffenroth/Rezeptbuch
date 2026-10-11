const CACHE = 'rezeptbuch-v4';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Netzwerk zuerst (damit Updates ankommen), Cache als Offline-Fallback. Google-APIs nie cachen.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Datei, die per "Teilen" an die App geschickt wurde: zwischenspeichern und App im Import-Modus öffnen
  if (e.request.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const file = (await e.request.formData()).get('rezepte');
        const text = file ? await file.text() : '';
        await (await caches.open('rezeptbuch-share')).put('shared', new Response(text));
      } catch { }
      return Response.redirect(new URL('index.html?import=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
