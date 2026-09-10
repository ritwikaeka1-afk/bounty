/* No page or API caching: private task data must not survive logout in a cache. */
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Bounty', {
    body: 'You have a task update. Open your inbox to review it.',
    tag: data.tag || 'bounty-update', renotify: false,
    data: { url: '/?view=inbox' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/?view=inbox'));
});
