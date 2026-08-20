/* Vaultline — offline shell.
   Only same-origin files are cached. Firebase traffic is never intercepted:
   Firestore has its own offline cache and handles that far better than we could. */
const CACHE = 'vaultline-v1';
const SHELL = [
  './',
  'index.html',
  'assets/css/styles.css',
  'assets/js/app.js',
  'assets/js/store.js',
  'assets/js/money.js',
  'assets/js/cloud.js',
  'assets/js/currencies.js',
  'assets/js/config.js',
  'assets/icon.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  /* Pages come from the network when possible so a deploy is picked up at once,
     and from the cache when there is no signal. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return res;
    }).catch(() => hit || Response.error()))
  );
});
