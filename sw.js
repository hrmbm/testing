/* HR&GA Workspace app cache worker — version 20261120-hrga-workspace-09. */
const BUILD = '20261120-hrga-workspace-09';
const APP_ASSET_CACHE = `hrga-workspace-app-assets-${BUILD}`;
const APP_CACHE_PREFIXES = ['hrga-workspace-app-assets-', 'hrga-workspace-app-shell-', 'portal-karir-app-assets-', 'portal-karir-app-shell-'];

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

  // Do not cache navigation HTML so GitHub Pages always serves current build markup.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(new Request(request, { cache: 'no-cache' })).catch(() => caches.match(request)));
    return;
  }

  if (!url.pathname.includes('/assets/') || !/\.(?:js|css)$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(APP_ASSET_CACHE);
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok && response.type !== 'opaque') {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw new Error('Asset unavailable offline');
    }
  })());
});
