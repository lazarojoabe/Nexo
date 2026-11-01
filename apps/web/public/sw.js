const CACHE = 'nexo-static-v2';
const ASSETS = ['/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => event.waitUntil(
  caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
));

self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  // Authenticated and private study data must never enter Cache Storage. This
  // also protects deployments where the API shares the web origin via a proxy.
  if (event.request.headers.has('authorization') || /\/(?:dashboard|quiz-sessions|essays|admin\/exam-imports)(?:\/|$)/.test(url.pathname)) return;

  // Documents must always come from the server so a newly deployed screen is
  // never hidden behind an old cached application shell.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }

  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
    const cacheControl = response.headers.get('cache-control') ?? '';
    if (response.ok && !/\bno-store\b/i.test(cacheControl)) {
      const copy = response.clone();
      void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  })));
});
