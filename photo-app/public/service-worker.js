self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.clients.claim();

      const clients = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });

      await Promise.all(
        clients.map((client) =>
          client.navigate(
            new URL(
              `/photos?cache-reset=done&v=force-aigc-nong-20260531`,
              client.url,
            ).toString(),
          ),
        ),
      );

      await self.registration.unregister();
    })(),
  );
});

self.addEventListener("fetch", () => {
  return;
});
