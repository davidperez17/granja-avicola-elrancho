/* Handlers de Web Push para El Rancho. Cargado por el SW generado via workbox.importScripts. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { title: 'El Rancho', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'El Rancho';
  const options = {
    body: data.body || '',
    icon: '/pwa-icon.svg',
    badge: '/pwa-icon.svg',
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
