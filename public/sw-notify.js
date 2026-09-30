// Loaded into the service worker: tapping a reminder opens the right page in the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => w.url.startsWith(self.registration.scope));
      if (win) {
        if (url && 'navigate' in win) win.navigate(url).catch(() => {});
        return win.focus();
      }
      return self.clients.openWindow(url || self.registration.scope);
    }),
  );
});
