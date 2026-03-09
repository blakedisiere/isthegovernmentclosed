// Service Worker — push notifications only (no offline caching)

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || 'Government Shutdown Update';
  const options = {
    body: data.body || 'The shutdown status has changed.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: 'shutdown-status',
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return clients.openWindow(url);
    })
  );
});
