/**
 * BZB service worker.
 *
 * Scope is deliberately narrow: receive push, show it, and route the click.
 * No asset caching — the app ships fresh from Vercel on every deploy, and a
 * stale cache would be a bug factory for no user-visible gain.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "BZB", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "BZB 🐝";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    dir: "rtl",
    lang: "he",
    // Same tag replaces an earlier notification instead of stacking, which is
    // what keeps a burst of chat messages from becoming a wall of banners.
    tag: payload.tag || "bzb",
    renotify: true,
    data: { url: payload.url || "/", notificationId: payload.notificationId || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Reuse an open tab when there is one, so clicking a notification never
      // leaves the user with a pile of duplicate app windows.
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) return client.navigate(target);
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
