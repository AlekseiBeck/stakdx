// Stakd Service Worker
// Handles push notifications for iOS (16.4+, requires PWA install) and Android

const CACHE_NAME = 'stakd-v1';

// ─── Install & activate ───────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ─── Push notification handler ────────────────────────────────────────────────
// iOS Safari 16.4+ fires this event when a push arrives, even with the app closed.
// Keep the payload simple — iOS does not support actions, vibrate, or renotify.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Stakd Alert', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: payload.tag || 'stakd-alert',
    // iOS ignores: vibrate, actions, requireInteraction
    // Keep it simple for cross-platform compatibility
    data: {
      url: payload.url || '/',
    },
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Stakd', options)
  );
});

// ─── Notification click handler ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
