// Keeps the app and body models available offline after a first visit.
const CACHE = 'corpus-v7'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  const isPage = request.mode === 'navigate'
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      if (isPage) {
        // Pages come from the network first, so that new versions appear as soon as they are online.
        try {
          const fresh = await fetch(request)
          cache.put(request, fresh.clone())
          return fresh
        } catch {
          return (await cache.match(request)) ?? (await cache.match('/')) ?? Response.error()
        }
      }
      const cached = await cache.match(request)
      if (cached) return cached
      // Model files keep their names when rebuilt, so this skips the browser's own cache, which could still hold an old copy.
      const fresh = await fetch(request, { cache: 'reload' })
      if (fresh.ok) cache.put(request, fresh.clone())
      return fresh
    }),
  )
})
