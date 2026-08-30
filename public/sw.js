self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const readyCar = windows.find((window) => window.url.includes(self.location.origin));
    return readyCar ? readyCar.focus() : clients.openWindow('/');
  }));
});
