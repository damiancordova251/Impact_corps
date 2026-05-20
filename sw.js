const APP_VERSION = "prepilot-2026-05-20-umbrella-cache";
const CACHE_NAME = `ready-${APP_VERSION}`;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/config.js",
  "./src/location.js",
  "./src/notifications.js",
  "./src/pilotAnalytics.js",
  "./src/reminders.js",
  "./src/weather.js",
  "./src/recommendation.js"
];
const ICON_ASSETS = [
  "./icons/app-icon.svg",
  "./icons/app-icon-180.png",
  "./icons/app-icon-192.png",
  "./icons/app-icon-512.png"
];
const ICON_PATHS = new Set(ICON_ASSETS.map(toAssetPath));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([
      ...CORE_ASSETS,
      ...ICON_ASSETS
    ]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }

        return null;
      })))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "./index.html"));
    return;
  }

  if (ICON_PATHS.has(requestUrl.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});

self.addEventListener("push", (event) => {
  const reminder = getPushReminder(event);

  event.waitUntil(
    self.registration.showNotification(reminder.title, {
      body: reminder.body,
      tag: reminder.tag ?? "ready-checklist",
      icon: "./icons/app-icon-192.png",
      badge: "./icons/app-icon-192.png",
      data: {
        url: reminder.url ?? "./"
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(openOrFocusAppFromNotification(event.notification.data?.url));
});

async function networkFirst(request, fallbackUrl = null) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await caches.match(request);

    if (cached) {
      return cached;
    }

    if (fallbackUrl) {
      return caches.match(fallbackUrl);
    }

    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }

  return response;
}

function getPushReminder(event) {
  if (!event.data) {
    return getDefaultReminder();
  }

  try {
    return {
      ...getDefaultReminder(),
      ...event.data.json()
    };
  } catch (error) {
    return {
      ...getDefaultReminder(),
      body: event.data.text() || getDefaultReminder().body
    };
  }
}

function getDefaultReminder() {
  return {
    title: "Ready Checklist",
    body: "Your weather checklist is ready.",
    tag: "ready-checklist",
    url: "./"
  };
}

async function openOrFocusAppFromNotification(notificationUrl = "./") {
  const targetUrl = getNotificationClickUrl(notificationUrl);
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });

  const matchingClient = windowClients.find((client) => {
    const clientUrl = new URL(client.url);

    return clientUrl.origin === new URL(targetUrl).origin;
  });

  if (matchingClient) {
    matchingClient.postMessage({ type: "notification_clicked" });
    return matchingClient.focus();
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(targetUrl);
  }

  return null;
}

function getNotificationClickUrl(notificationUrl) {
  const targetUrl = new URL(notificationUrl, self.registration.scope);

  targetUrl.searchParams.set("notification", "clicked");
  return targetUrl.href;
}

function toAssetPath(asset) {
  return new URL(asset, self.registration.scope).pathname;
}
