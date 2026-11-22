/* Portal Karir app cache worker — version 20261122-lowongan-v5. */
const BUILD = '20261122-lowongan-v5';
const APP_ASSET_CACHE = `portal-karir-app-assets-${BUILD}`;
const APP_CACHE_PREFIXES = ['portal-karir-app-assets-', 'portal-karir-app-shell-'];

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => APP_CACHE_PREFIXES.some(prefix => name.startsWith(prefix)) && name !== APP_ASSET_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Do not cache form HTML. A navigation must always ask the host for the
  // current build; UI assets are separately versioned in their import URLs.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
    return;
  }

  if (!url.pathname.includes('/assets/') || !/\.(?:js|css)$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(APP_ASSET_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok && response.type !== 'opaque') await cache.put(request, response.clone());
    return response;
  })());
});
