/* Vaultline — offline shell.
 *
 * The cache name carries a version. Bump it on any release that changes these
 * files: a stale mix of new HTML and old JavaScript is worse than no cache at
 * all, because the old script looks for elements the new page no longer has,
 * throws while loading, and takes every button down with it.
 *
 * Same-origin files are fetched from the network first and fall back to the
 * cache, so a deploy is picked up immediately and the app still opens with no
 * connection. Firebase traffic is never intercepted; Firestore has its own
 * offline cache and handles that far better than we could.
 */
const VERSION = 'v3';
const CACHE = `vaultline-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'assets/icon.svg',
  'assets/bg-mountains.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      /* One missing file must not fail the whole install. */
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'vaultline-reset') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  /* Revalidate rather than trust max-age: a stale script served against a
     newer page is the failure this whole file must not cause. */
  const fresh = new Request(request.url, {
    cache: 'no-cache',
    credentials: 'same-origin',
    headers: request.headers,
    mode: request.mode === 'navigate' ? 'same-origin' : request.mode,
    redirect: 'follow'
  });

  event.respondWith(
    fetch(fresh)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => {
        if (hit) return hit;
        if (request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      }))
  );
});
