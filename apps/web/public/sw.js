const cacheName = 'nexus-offline-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.add('/offline.html')))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('nexus-offline-') && key !== cacheName)
      .map((key) => caches.delete(key)),
  )))
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  event.respondWith(fetch(event.request).catch(async () =>
    (await caches.match('/offline.html')) ?? Response.error(),
  ))
})
