const CACHE = 'readycar-offline-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add('/offline.html')),
  );
});
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate')
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html')),
    );
});
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'ReadyCar', {
      body: data.body || 'Tienes documentos por revisar.',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url || '/' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const readyCar = windows.find((window) =>
          window.url.includes(self.location.origin),
        );
        return readyCar
          ? readyCar.focus()
          : clients.openWindow(event.notification.data?.url || '/');
      }),
  );
});
