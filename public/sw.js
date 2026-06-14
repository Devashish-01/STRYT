self.addEventListener("push", function (event) {
  let data = { title: "Naya", body: "You have a new notification", deepLink: "/" };
  try { data = event.data.json(); } catch { /* use defaults */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { deepLink: data.deepLink },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const deepLink = event.notification.data?.deepLink || "/";
      for (const c of cs) {
        if (c.url.includes(self.location.origin) && "focus" in c) {
          c.postMessage({ type: "NAVIGATE", path: deepLink });
          return c.focus();
        }
      }
      return clients.openWindow(deepLink);
    })
  );
});
