const CACHE_NAME = 'my-passwords-v0.054';
const RUNTIME_CACHE = `${CACHE_NAME}-runtime`;
const APP_ROUTES = ['/', '/vault', '/admin', '/terms', '/privacy', '/billing-terms', '/index.html'];
const STATIC_SHELL = ['/manifest.webmanifest', '/favicon.ico', '/favicon-32x32.png', '/favicon-16x16.png', '/apple-touch-icon.png', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/splash-icon.png', '/images/password-encrypt-brand.png', '/images/password-encrypt-og.png', '/offline.html', '/offline.js'];

async function putIfUsable(cache, request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return response;
  try {
    await cache.put(request, response.clone());
  } catch {
    // A failed runtime cache write must never block the live response.
  }
  return response;
}

async function cacheCurrentAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch('/index.html', { cache: 'reload' });

  if (!indexResponse.ok) throw new Error('The application shell could not be downloaded.');

  await Promise.all(APP_ROUTES.map((route) => cache.put(route, indexResponse.clone())));

  const html = await indexResponse.clone().text();
  const discoveredAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => value.startsWith('/') && !value.startsWith('//'));

  const shellAssets = [...new Set([...STATIC_SHELL, ...discoveredAssets])];
  await Promise.allSettled(shellAssets.map(async (asset) => {
    const response = await fetch(asset, { cache: 'reload' });
    await putIfUsable(cache, asset, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCurrentAppShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('my-passwords-v') && ![CACHE_NAME, RUNTIME_CACHE].includes(key))
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response?.ok) {
      await cache.put(request, response.clone());
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request))
      || (await cache.match('/index.html'))
      || (await cache.match('/offline.html'))
      || new Response(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Password-Encrypt offline</title></head><body><h1>No internet connection</h1><p>Reconnect and try again.</p></body></html>',
        { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 503 }
      );
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    return putIfUsable(cache, request, response);
  } catch {
    return cached || Response.error();
  }
}

async function networkWithRuntimeFallback(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    return putIfUsable(cache, request, response);
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API calls must never fall back to index.html. Return a clear offline JSON
  // response so the app can guide the user instead of trying to parse HTML.
  if (url.origin === self.location.origin && url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({
        ok: false,
        code: 'OFFLINE',
        message: 'No internet connection. Cloud features will resume when you are online.'
      }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }))
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isStaticAsset = ['script', 'style', 'image', 'font', 'manifest', 'worker'].includes(request.destination)
    || /\.(?:js|mjs|css|svg|png|jpg|jpeg|webp|ico|woff2?|json|webmanifest)$/i.test(url.pathname);
  // Ver-0.053I: do not proxy Google Fonts through the PWA service worker.
  // Let the browser load/cache cross-origin font CSS and font files directly;
  // this avoids standalone/mobile WebView font responses being trapped in the
  // service-worker runtime cache. Same-origin app assets remain cache-first.
  if (isSameOrigin && isStaticAsset) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  if (isSameOrigin) event.respondWith(networkWithRuntimeFallback(request));
});
