// Tapping a task notification opens (or focuses) the app on the To-do screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL('./#/m/todo', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
